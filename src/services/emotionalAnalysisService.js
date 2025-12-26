// src/services/emotionalAnalysisService.js
import fetch from "node-fetch";
import { config } from "dotenv";
import { pool } from "../db/mysql.js";
import { getPersonaReactions } from "./simulationDbService.js";

config();

async function classifyEmotion(text) {
  const apiUrl =
    "https://router.huggingface.co/hf-inference/models/j-hartmann/emotion-english-distilroberta-base";
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (!Array.isArray(result) || !result[0]) {
    throw new Error(`Unexpected response from HF: ${JSON.stringify(result)}`);
  }

  const sorted = result[0].sort((a, b) => b.score - a.score);
  const dominantEmotion = sorted[0].label;
  const secondaryEmotions = sorted.slice(1).map((e) => e.label);
  const intensity = Math.round(sorted[0].score * 10);

  return {
    dominant_emotion: dominantEmotion,
    intensity,
    sentiment: mapEmotionToSentiment(dominantEmotion),
    secondary_emotions: secondaryEmotions,
  };
}

function mapEmotionToSentiment(emotion) {
  const positive = ["joy", "love", "surprise"];
  const negative = ["anger", "sadness", "fear", "disgust"];
  
  if (positive.includes(emotion)) return "positive";
  if (negative.includes(emotion)) return "negative";
  return "neutral";
}

/**
 * Run emotional analysis on all persona reactions for a simulation run
 * This can be called independently of the main simulation
 */
export async function runEmotionalAnalysis(simulationRunId) {
  console.log(`\nStarting emotional analysis for simulation run #${simulationRunId}...\n`);

  // Fetch persona reactions from database
  const personaReactions = await getPersonaReactions(simulationRunId);
  
  if (personaReactions.length === 0) {
    throw new Error(`No persona reactions found for simulation run #${simulationRunId}`);
  }

  const results = [];
  const processedReactions = new Set();
  let count = 0;
  let skipped = 0;

  for (const persona of personaReactions) {
    const reaction = persona.raw_reaction;

    // Skip if empty, error, or already processed
    if (!reaction?.trim() || 
        reaction === "Error generating reaction" || 
        processedReactions.has(reaction)) {
      skipped++;
      continue;
    }

    processedReactions.add(reaction);

    try {
      count += 1;
      console.log(
        `Analyzing emotion ${count}/${personaReactions.length}: Persona ${persona.persona_id} (${persona.persona_name})`
      );

      const emotionAnalysis = await classifyEmotion(reaction);

      // Update DB with emotion data
      await pool.query(
        `UPDATE persona_reactions 
         SET dominant_emotion = ?, sentiment = ?, intensity = ?, secondary_emotions = ?
         WHERE simulation_run_id = ? AND persona_id = ?`,
        [
          emotionAnalysis.dominant_emotion,
          emotionAnalysis.sentiment,
          emotionAnalysis.intensity,
          JSON.stringify(emotionAnalysis.secondary_emotions),
          simulationRunId,
          persona.persona_id,
        ]
      );

      results.push({
        persona_id: persona.persona_id,
        persona_name: persona.persona_name,
        cluster_id: persona.cluster_id,
        reaction: reaction.substring(0, 100) + (reaction.length > 100 ? "..." : ""),
        emotion_analysis: emotionAnalysis,
      });

      // Log progress every 100 analyses
      if (count % 100 === 0) {
        console.log(`Emotional analysis progress: ${count}/${personaReactions.length}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(
        `Error analyzing persona ${persona.persona_id}:`,
        error.message
      );
      
      // Continue with next persona even if one fails
    }
  }

  console.log(`\nCompleted ${count} emotional analyses (${skipped} skipped)\n`);

  return results;
}
