import { compiledSimulationGraph } from "../agents/simulation/runSimulationGraph.js";
import { HumanMessage } from "@langchain/core/messages";
// import { clusterReactions, personaReactions } from "../global/index.js";
// import { imageBase64 } from "../agents/simulation/base.js";
import { emotionalAnalyzer } from "../tools/emotionalAnalyzer.js";
import { analyzerMetrics } from "../helpers/analyzerMetrics.js";
//import { bootstrapSimulationState } from "../scripts/bootstrapSimulationState.js";
import { bootstrapSimulationState_limitedPersonas } from "../scripts/bootstrapSimulationState_limitedPersonas.js";
import { traceable } from "langsmith/traceable";

const runSimulation = traceable(
  async ({ campaignId, imageBase64, campaignDescription }) => {
    await bootstrapSimulationState_limitedPersonas({
      campaignId,
      personaLimit: 5,
    });

    const prompt = new HumanMessage({
      content: [
        {
          type: "text",
          text: `Get a detailed description of the ad image. cover everything including content, tone, triggers, genre, product, colors, text, picture, feel, strategies etc. and simulate reaction. And use this campaign description ${campaignDescription}`,
        },
        {
          type: "image_url",
          image_url: { url: imageBase64 },
        },
      ],
    });

    await compiledSimulationGraph.invoke({
      messages: [prompt],
    });

    const emotionalAnalysisResults = await emotionalAnalyzer.invoke({});

    return analyzerMetrics(emotionalAnalysisResults);
  },
  {
    name: "simulate_ad_reactions_pipeline",
    tags: ["simulation"],
  }
);

export const simulateAdReactions = async (req, res) => {
  const { campaignId, imageBase64, campaignDescription } = req.body;

  try {
    const {
      total_personas,
      sentiment_breakdown,
      top_emotions,
      average_intensity,
      cluster_summaries,
      high_level_tags,
    } = await runSimulation({
      campaignId,
      imageBase64,
      campaignDescription,
    });

    return res.status(200).json({
      status: "ok",
      message: "Simulation complete.",
      campaign_name: "Apni Shaadi Se Bhaagna Ho Tou Careem Bike Mangao",
      componentId: 1,
      campaign_description: campaignDescription,
      image_url: imageBase64,
      total_personas,
      sentiment_breakdown,
      top_emotions,
      average_intensity,
      cluster_summaries,
      high_level_tags,
    });
  } catch (error) {
    console.error("❌ Error running simulation:", error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
