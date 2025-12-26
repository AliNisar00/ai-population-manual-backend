// src/services/simulationDbService.js
import { pool } from "../db/mysql.js";

// Check if campaign already exists
export async function campaignExists(campaignId) {
  const [rows] = await pool.query(
    "SELECT campaign_id FROM campaigns WHERE campaign_id = ?",
    [campaignId]
  );
  return rows.length > 0;
}

// Create a new campaign
export async function createCampaign({
  campaignId,
  campaignName,
  campaignDescription,
  imageUrl,
}) {
  await pool.query(
    "INSERT INTO campaigns (campaign_id, campaign_name, campaign_description, image_url) VALUES (?, ?, ?, ?)",
    [campaignId, campaignName, campaignDescription, imageUrl]
  );
}


// Create a new simulation run
export async function createSimulationRun(campaignId, totalPersonas) {
  const [result] = await pool.query(
    "INSERT INTO simulation_runs (campaign_id, status, total_personas, current_step) VALUES (?, 'pending', ?, 'Initializing')",
    [campaignId, totalPersonas]
  );
  return result.insertId;
}

// Update simulation run status
export async function updateSimulationRun(simulationRunId, updates) {
  const fields = [];
  const values = [];

  if (updates.status) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.processedPersonas !== undefined) {
    fields.push("processed_personas = ?");
    values.push(updates.processedPersonas);
  }
  if (updates.currentStep) {
    fields.push("current_step = ?");
    values.push(updates.currentStep);
  }
  if (updates.errorMessage) {
    fields.push("error_message = ?");
    values.push(updates.errorMessage);
  }
  if (updates.status === "completed" || updates.status === "failed") {
    fields.push("completed_at = NOW()");
  }

  values.push(simulationRunId);

  await pool.query(
    `UPDATE simulation_runs SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}


// Save cluster reaction
export async function saveClusterReaction(
  simulationRunId,
  campaignId,
  clusterId,
  reaction
) {
  await pool.query(
    "INSERT INTO cluster_reactions (simulation_run_id, campaign_id, cluster_id, reaction) VALUES (?, ?, ?, ?)",
    [simulationRunId, campaignId, clusterId, reaction]
  );
}


// Save persona reaction
export async function savePersonaReaction(data) {
  await pool.query(
    `INSERT INTO persona_reactions 
    (simulation_run_id, campaign_id, cluster_id, persona_id, persona_name, raw_reaction, dominant_emotion, sentiment, intensity, secondary_emotions) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.simulationRunId,
      data.campaignId,
      data.clusterId,
      data.personaId,
      data.personaName,
      data.rawReaction,
      data.dominantEmotion || null,
      data.sentiment || null,
      data.intensity || null,
      data.secondaryEmotions ? JSON.stringify(data.secondaryEmotions) : null,
    ]
  );
}

// Get simulation run status
export async function getSimulationRunStatus(simulationRunId) {
  const [rows] = await pool.query(
    `SELECT sr.*, c.campaign_name, c.campaign_description, c.image_url
     FROM simulation_runs sr
     JOIN campaigns c ON sr.campaign_id = c.campaign_id
     WHERE sr.id = ?`,
    [simulationRunId]
  );
  
  if (rows.length === 0) return null;
  
  const run = rows[0];
  const progress = run.total_personas > 0 
    ? Math.round((run.processed_personas / run.total_personas) * 100)
    : 0;
  
  // Calculate ETA
  let eta = null;
  if (run.status === 'processing' && run.processed_personas > 0) {
    const elapsed = Date.now() - new Date(run.started_at).getTime();
    const avgTimePerPersona = elapsed / run.processed_personas;
    const remaining = run.total_personas - run.processed_personas;
    const etaMs = avgTimePerPersona * remaining;
    eta = Math.ceil(etaMs / 1000 / 60); // minutes
  }
  
  return {
    ...run,
    progress,
    eta,
  };
}


// Get all persona reactions for a simulation run
export async function getPersonaReactions(simulationRunId) {
  const [rows] = await pool.query(
    "SELECT * FROM persona_reactions WHERE simulation_run_id = ? ORDER BY cluster_id, persona_id",
    [simulationRunId]
  );
  return rows;
}


// Get simulation results (for frontend display)
export async function getSimulationResults(campaignId) {
  const [runRows] = await pool.query(
    "SELECT * FROM simulation_runs WHERE campaign_id = ? ORDER BY started_at DESC LIMIT 1",
    [campaignId]
  );
  
  if (runRows.length === 0) return null;
  
  const simulationRunId = runRows[0].id;
  const reactions = await getPersonaReactions(simulationRunId);
  
  return {
    simulationRun: runRows[0],
    reactions,
  };
}


// Save aggregated emotional analysis metrics
export async function saveEmotionalMetrics(simulationRunId, metrics) {
  const sentimentBreakdown = metrics.sentiment_breakdown;
  
  // Helper to parse percentage strings like "77.7%" to numbers
  const parsePercent = (str) => parseFloat(str.replace('%', ''));
  
  try {
    await pool.query(
      `INSERT INTO emotional_metrics 
      (simulation_run_id, total_personas, sentiment_positive_percent, 
       sentiment_neutral_percent, sentiment_negative_percent, top_emotions, 
       average_intensity, cluster_summaries, high_level_tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_personas = VALUES(total_personas),
        sentiment_positive_percent = VALUES(sentiment_positive_percent),
        sentiment_neutral_percent = VALUES(sentiment_neutral_percent),
        sentiment_negative_percent = VALUES(sentiment_negative_percent),
        top_emotions = VALUES(top_emotions),
        average_intensity = VALUES(average_intensity),
        cluster_summaries = VALUES(cluster_summaries),
        high_level_tags = VALUES(high_level_tags)`,
      [
        simulationRunId,
        metrics.total_personas,
        parsePercent(sentimentBreakdown.positive),
        parsePercent(sentimentBreakdown.neutral),
        parsePercent(sentimentBreakdown.negative),
        JSON.stringify(metrics.top_emotions),
        parseFloat(metrics.average_intensity),
        JSON.stringify(metrics.cluster_summaries),
        JSON.stringify(metrics.high_level_tags),
      ]
    );
    
    console.log(`Saved emotional metrics for simulation run #${simulationRunId}`);
  } catch (error) {
    console.error(`Error saving emotional metrics:`, error.message);
    throw error;
  }
}


// Get emotional metrics for a simulation run
export async function getEmotionalMetrics(simulationRunId) {
  const [rows] = await pool.query(
    `SELECT * FROM emotional_metrics WHERE simulation_run_id = ?`,
    [simulationRunId]
  );
  
  if (rows.length === 0) return null;
  
  return rows[0];
}
