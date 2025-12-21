import fetch from "node-fetch";
import { config } from "dotenv";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
// import { cluster_reactions } from "../base.js";
// import { personaReactions } from "../simulationResults.js";
import { personaReactions } from "../global/index.js";
import { traceable } from "langsmith/traceable";

config();
let count = 0;

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

export const emotionalAnalyzer = tool(
  traceable(
    async () => {
    const results = [];
    const processedReactions = new Set();

    console.log("Starting emotional analysis with HuggingFace...");

    for (const persona of personaReactions.value) {
      const reaction = persona.reaction;
      if (reaction?.trim() && !processedReactions.has(reaction)) {
        processedReactions.add(reaction);

        try {
          console.log(`Processing persona ${persona.persona_id}...`);
          count += 1;
          const emotionAnalysis = await classifyEmotion(reaction);

          results.push({
            persona_id: persona.persona_id,
            persona_name: persona.personaName,
            cluster_id: persona.cluster_id,
            reaction:
              reaction.substring(0, 100) + (reaction.length > 100 ? "..." : ""),
            emotion_analysis: emotionAnalysis,
          });
        } catch (error) {
          console.error(
            `Error analyzing persona ${persona.persona_id}:`,
            error.message
          );
        }
      }
    }
    console.log(count);
    return results;
    },
    {
      name: "emotional_analyzer",
    }
  ),
  {
    name: "emotional_analyzer",
    description:
      "Analyzes emotional content of persona reactions using HuggingFace emotion detection model",
    schema: z.object({}),
  }
);
