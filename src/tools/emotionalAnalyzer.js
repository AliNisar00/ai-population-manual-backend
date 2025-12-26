// src/tools/emotionalAnalyzer.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { traceable } from "langsmith/traceable";
import { runEmotionalAnalysis } from "../services/emotionalAnalysisService.js";

/**
 * This tool is a wrapper around the emotional analysis service
 * It can be called by LangChain agents during the simulation workflow
 */
export const emotionalAnalyzer = tool(
  traceable(
    async ({ simulationRunId, campaignId }) => {
      console.log(`\nEmotional Analyzer Tool called for simulation #${simulationRunId}\n`);
      
      // Call the standalone service
      const results = await runEmotionalAnalysis(simulationRunId);
      
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
    schema: z.object({
      simulationRunId: z.number().describe("The simulation run ID"),
      campaignId: z.string().describe("The campaign ID"),
    }),
  }
);