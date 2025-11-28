import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { generateMetrics } from "../helpers/generateMetrics.js";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function getClustersWithData() {
  console.log("🔍 Service: Querying database...");

  // 0. Define Campaign ID (Hardcoded as the original backe nd)
  const campaignId = 1;

  // 1. Fetch Clusters from db table "clusters"
  const [clusterRows] = await pool.execute(
    `SELECT id, cluster_label, size, leading_factors, created_at 
     FROM clusters 
     ORDER BY cluster_label ASC`
  );

  // 2. Fetch Members from db table "cluster_members"
  const [memberRows] = await pool.execute(
    `SELECT 
       cm.cluster_id,
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
       p.description
     FROM cluster_members cm
     JOIN Personas p ON cm.persona_id = p.persona_id
     ORDER BY cm.cluster_id`
  );

  // 3. Nest members into clusters
  const clusters = clusterRows.map((cluster) => {
    let factors = [];
    try {
      factors = typeof cluster.leading_factors === 'string' 
        ? JSON.parse(cluster.leading_factors) 
        : cluster.leading_factors;
    } catch (e) {
      factors = [];
    }

    // Get personas for this specific cluster
    const members = memberRows.filter((m) => m.cluster_id === cluster.id);

    return {
      cluster_id: cluster.cluster_label, // Using algorithm label as ID for frontend consistency
      db_id: cluster.id,                 // Keeping DB ID just in case
      size: cluster.size,
      leading_factors: factors,
      personas: members,
    };
  });

  // 4. Calculate target market metrics for all personas combined
  // We extract all personas from all clusters into one big array
  const allPersonas = clusters.flatMap((c) => c.personas);
  const targetMarketMetrics = generateMetrics(allPersonas);

  // 5. Calculate cluster metrics for each cluster
  const clusterMetrics = clusters.map((cluster) => ({
    cluster_id: cluster.cluster_id,
    metrics: generateMetrics(cluster.personas),
  }));

  // Return the exact shape the frontend expects as per the original backend
  return {
    clusters,
    targetMarketMetrics,
    clusterMetrics,
    campaignId
  };
}