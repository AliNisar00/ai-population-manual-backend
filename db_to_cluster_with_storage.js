// To run the script run the following command in terminal at root of this project:
//   node --enable-source-maps db_to_cluster_with_storage.js

import dotenv from "dotenv";
dotenv.config();

import mysql from "mysql2/promise";
import {
  setPersonas,
  performPersonaClustering
} from "./cluster_helpers.js";

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASS,
  DB_NAME
} = process.env;


// Convert DB row -> persona object shape as expected by clustering in the old backend
function rowToPersona(row) {
  let languages = [];
  if (row.languages) {
    if (Array.isArray(row.languages)) {
      languages = row.languages;
    } else {
      languages = String(row.languages)
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    }
  }

  let age = null;
  if (row.age !== null && row.age !== undefined && row.age !== "") {
    const n = Number(row.age);
    age = Number.isFinite(n) ? n : row.age;
  }

  const demographics = {
    persona_id: row.persona_id,
    name: row.name,
    age: age,
    gender: row.gender,
    education: row.education,
    location: {
      region: row.region,
      city: row.city,
    },
    religion: row.religion,
    languages: languages,
    ethnicity: row.ethnicity,
    literacy: row.literacy,
  };

  const personality = {
    emotional_responsiveness: row.emotional_responsiveness ?? null,
    temperament: row.temperament ?? null,
    communication_style: row.communication_style ?? null,
    language_mix: row.language_mix ?? null,
    attitude_towards_ads: row.attitude_towards_ads ?? null,
    positive_triggers: row.positive_triggers ?? null,
    negative_triggers: row.negative_triggers ?? null,
  };

  return {
    metadata: { demographics, personality },
    description: row.description ?? "",
  };
}


// Fetch personas from DB
export async function fetchPersonasFromDB(dbConfig = {}) {
  const cfg = {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    ...dbConfig,
  };

  const conn = await mysql.createConnection(cfg);

  const sql = `
    SELECT
      p.persona_id,
      p.name,
      p.age,
      p.gender,
      p.education,
      p.region,
      p.city,
      p.religion,
      p.languages,
      p.ethnicity,
      p.literacy,
      p.description,
      pp.emotional_responsiveness,
      pp.temperament,
      pp.communication_style,
      pp.language_mix,
      pp.attitude_towards_ads,
      pp.positive_triggers,
      pp.negative_triggers
    FROM Personas p
    LEFT JOIN personality_profiles pp
      ON p.persona_id = pp.persona_id
    ORDER BY p.persona_id;
  `;

  try {
    const [rows] = await conn.execute(sql);
    await conn.end();
    return rows.map(rowToPersona);
  } catch (err) {
    try { await conn.end(); } catch (e) {}
    throw err;
  }
}


// Store clusters into MySQL
async function storeClustersInDB(result) {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  });

  console.log("🗄  Storing clusters into MySQL (preserving label & aligning ids)...");

  // Ensure base tables exist. We will ensure cluster_label column exists below.
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS clusters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cluster_index INT NULL,
      cluster_label INT NULL,
      size INT NOT NULL,
      leading_factors JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cluster_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cluster_id INT NOT NULL,
      persona_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cluster_id) REFERENCES clusters(id)
    );
  `);

  // Ensure clusters table has column 'cluster_label' (for original algorithm label).
  const [colRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'clusters' AND COLUMN_NAME = 'cluster_label'`,
    [DB_NAME]
  );
  if (colRows[0].cnt === 0) {
    console.log("Adding 'cluster_label' column to clusters table...");
    await conn.execute(`ALTER TABLE clusters ADD COLUMN cluster_label INT NULL AFTER cluster_index`);
  }

  // Loop clusters and insert preserving mapping
  for (const cluster of result.clusters) {
    // cluster.cluster_id is the algorithm label in your output (e.g., 0,1,2)
    const algLabel = cluster.cluster_id ?? cluster.cluster_label ?? null;
    const size = cluster.size ?? (cluster.personas ? cluster.personas.length : 0);
    const leading = cluster.leading_factors ?? [];

    // Insert cluster row with cluster_label; cluster_index will be set after insert to match insertId
    const [insertRes] = await conn.execute(
      `INSERT INTO clusters (cluster_label, size, leading_factors)
       VALUES (?, ?, ?)`,
      [algLabel, size, JSON.stringify(leading)]
    );

    const insertedId = insertRes.insertId;
    if (!insertedId) {
      console.warn(`insertId missing for cluster with label ${algLabel}; skipping members`);
      continue;
    }

    // Update cluster_index to equal the inserted id so cluster_index matches cluster_members.cluster_id
    await conn.execute(
      `UPDATE clusters SET cluster_index = ? WHERE id = ?`,
      [insertedId, insertedId]
    );

    // Extract persona ids from cluster.personas (handles cases where personas is array of objects or raw ids)
    const personaIds = (cluster.personas || []).map((p) =>
      typeof p === "object" ? p.persona_id || p.personaId || p.id : p
    ).filter(Boolean);

    if (personaIds.length === 0) {
      console.log(`   Cluster (label=${algLabel}, id=${insertedId}) has 0 persona IDs (skipping member insert)`);
      continue;
    }

    // Build rows for bulk insert: [[cluster_id, persona_id], ...]
    const rows = personaIds.map(pid => [insertedId, pid]);

    // Bulk insert using mysql2 placeholder
    await conn.query(
      `INSERT INTO cluster_members (cluster_id, persona_id) VALUES ?`,
      [rows]
    );

    console.log(`   Stored cluster (label=${algLabel}) as id=${insertedId} with ${personaIds.length} members`);
  }

  console.log("SUCCESS: All clusters stored successfully.");
  await conn.end();
}


// Main runner
export async function runClusteringFromDB(options = {}) {
  const {
    kMin = 15,
    kMax = 20,
    featurePriorities,
    leadingFactorThreshold = 0.7,
  } = options;

  console.log("Connecting to DB and fetching personas...");
  const personas = await fetchPersonasFromDB();

  if (!personas || personas.length === 0) {
    throw new Error("No personas fetched from DB.");
  }

  setPersonas(personas);

  console.log(
    `Loaded ${personas.length} personas into memory. Starting clustering...`
  );

  const result = performPersonaClustering({
    useStoredPersonas: true,
    kMin,
    kMax,
    featurePriorities,
    leadingFactorThreshold,
  });

  // Print summary to console
  console.log("Clustering result summary:");
  console.log(`  totalPersonas: ${result.totalPersonas}`);
  console.log(`  totalClusters: ${result.totalClusters}`);
  console.log(`  chosenK: ${result.metadata.chosenK}`);
  result.clusters.forEach((c) => {
    console.log(`  Cluster ${c.cluster_id} — size ${c.size}`);
    if (c.leading_factors?.length) {
      console.log(`    leading factors: ${JSON.stringify(c.leading_factors)}`);
    }
  });

  // Store into MySQL
  await storeClustersInDB(result);

  return result;
}

// Entry point if run directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith("cluster_from_mysql.js")
) {
  (async () => {
    try {
      const kMin = process.env.K_MIN ? Number(process.env.K_MIN) : undefined;
      const kMax = process.env.K_MAX ? Number(process.env.K_MAX) : undefined;

      await runClusteringFromDB({
        ...(kMin ? { kMin } : {}),
        ...(kMax ? { kMax } : {}),
      });

      console.log("Done.");
      process.exit(0);
    } catch (err) {
      console.error("Error:", err.message || err);
      process.exit(2);
    }
  })();
}
