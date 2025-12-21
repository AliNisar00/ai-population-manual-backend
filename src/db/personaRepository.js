// Repository of functions to get data in different ways from MySQL DB
import { pool } from "./mysql.js";

export async function getClusters() {
  const [rows] = await pool.execute(
    `SELECT id, cluster_label, size, leading_factors, created_at
     FROM clusters
     ORDER BY cluster_label ASC`
  );
  return rows;
}

export async function getClusterMembers() {
  const [rows] = await pool.execute(
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
  return rows;
}

export async function getPersonaById(personaId) {
  const [rows] = await pool.execute(
    `SELECT *
     FROM Personas
     WHERE persona_id = ?`,
    [personaId]
  );

  return rows[0] || null;
}
