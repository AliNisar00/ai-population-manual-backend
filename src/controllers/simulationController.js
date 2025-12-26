// src/controllers/simulationController.js
import { compiledSimulationGraph } from "../agents/simulation/runSimulationGraph.js";
import { HumanMessage } from "@langchain/core/messages";
import { runEmotionalAnalysis } from "../services/emotionalAnalysisService.js";
import { analyzerMetrics } from "../helpers/analyzerMetrics.js";
import { bootstrapSimulationState } from "../scripts/bootstrapSimulationState.js";
import { traceable } from "langsmith/traceable";
import {
  campaignExists,
  createCampaign,
  createSimulationRun,
  updateSimulationRun,
  getSimulationRunStatus,
} from "../services/simulationDbService.js";
import { clusterResults } from "../global/index.js";

const runSimulation = traceable(
  async ({ campaignId, imageBase64, campaignDescription, simulationRunId }) => {
    try {
      // Bootstrap simulation state (loads all personas)
      await bootstrapSimulationState({ campaignId });

      const totalPersonas = clusterResults.value.clusters.reduce(
        (sum, c) => sum + c.personas.length,
        0
      );

      console.log(`\nStarting simulation for ${totalPersonas} personas...\n`);

      // Update simulation run with total personas
      await updateSimulationRun(simulationRunId, {
        status: "processing",
        currentStep: "Analyzing advertisement",
      });

      const prompt = new HumanMessage({
        content: [
          {
            type: "text",
            text: `Get a detailed description of the ad image. Cover everything including content, tone, triggers, genre, product, colors, text, picture, feel, strategies etc. and simulate reaction. Use this campaign description: ${campaignDescription}`,
          },
          {
            type: "image_url",
            image_url: { url: imageBase64 },
          },
        ],
      });

      console.log("Sending prompt to simulation graph with image...");

      // Pass simulationRunId to the graph so tools can update progress
      await compiledSimulationGraph.invoke({
        messages: [prompt],
        simulationRunId,
        campaignId,
      });

      console.log("Simulation graph completed successfully");

      // Update status before emotional analysis
      await updateSimulationRun(simulationRunId, {
        currentStep: "Running emotional analysis",
      });

      console.log("\nRunning emotional analysis on all reactions...\n");

      // Call the service directly instead of through tool interface
      const emotionalAnalysisResults = await runEmotionalAnalysis(simulationRunId);

      const metrics = analyzerMetrics(emotionalAnalysisResults);

      await saveEmotionalMetrics(simulationRunId, metrics);

      // Mark as completed
      await updateSimulationRun(simulationRunId, {
        status: "completed",
        currentStep: "Complete",
        processedPersonas: totalPersonas,
      });

      console.log("\nSimulation completed successfully!\n");

      return metrics;
    } catch (error) {
      console.error("\nSimulation error:", error);

      await updateSimulationRun(simulationRunId, {
        status: "paused",
        errorMessage: error.message,
      });

      // Auto-resume after delay
      console.log("Simulation paused. Auto-resuming in 60 seconds...");
      setTimeout(async () => {
        console.log("Attempting to resume simulation...");
        try {
          await runSimulation({
            campaignId,
            imageBase64,
            campaignDescription,
            simulationRunId,
          });
        } catch (retryError) {
          console.error("Resume failed:", retryError);
        }
      }, 60000);

      throw error;
    }
  },
  {
    name: "simulate_ad_reactions_pipeline",
    tags: ["simulation"],
  }
);

export const simulateAdReactions = async (req, res) => {
  const { campaignId, imageBase64, campaignDescription, campaignName } = req.body;

  try {
    // Check if campaign already exists
    const exists = await campaignExists(campaignId);
    if (exists) {
      return res.status(400).json({
        status: "error",
        message: `Campaign with ID "${campaignId}" already exists. Please use a different campaign ID.`,
      });
    }

    // Create campaign
    await createCampaign({
      campaignId,
      campaignName: campaignName || "Untitled Campaign",
      campaignDescription,
      imageUrl: imageBase64,
    });

    // Create simulation run
    const simulationRunId = await createSimulationRun(campaignId, 0);

    console.log(`\nCreated simulation run #${simulationRunId} for campaign: ${campaignId}\n`);

    // Start simulation asynchronously
    runSimulation({
      campaignId,
      imageBase64,
      campaignDescription,
      simulationRunId,
    }).catch((error) => {
      console.error("Simulation failed:", error);
    });

    // Return immediately with simulation ID
    return res.status(202).json({
      status: "accepted",
      message: "Simulation started. Check status endpoint for progress.",
      simulationRunId,
      campaignId,
      statusEndpoint: `/simulation/${simulationRunId}/status`,
    });
  } catch (error) {
    console.error("Error starting simulation:", error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get simulation status
export const getSimulationStatus = async (req, res) => {
  const { simulationId } = req.params;

  try {
    const status = await getSimulationRunStatus(simulationId);

    if (!status) {
      return res.status(404).json({
        status: "error",
        message: "Simulation not found",
      });
    }

    return res.status(200).json({
      status: "ok",
      simulation: {
        id: status.id,
        campaignId: status.campaign_id,
        campaignName: status.campaign_name,
        status: status.status,
        progress: `${status.processed_personas}/${status.total_personas}`,
        progressPercent: status.progress,
        eta: status.eta ? `${status.eta} minutes` : null,
        currentStep: status.current_step,
        startedAt: status.started_at,
        completedAt: status.completed_at,
        errorMessage: status.error_message,
      },
    });
  } catch (error) {
    console.error("Error getting simulation status:", error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Run emotional analysis on an existing simulation
export const analyzeEmotions = async (req, res) => {
  const { simulationId } = req.params;

  try {
    console.log(`\nStarting emotional analysis for simulation #${simulationId}...\n`);

    // Update status
    await updateSimulationRun(simulationId, {
      currentStep: "Running emotional analysis",
    });

    // Run analysis asynchronously
    runEmotionalAnalysis(simulationId)
      .then(async (results) => {
        const metrics = analyzerMetrics(results);
        
        await updateSimulationRun(simulationId, {
          status: "completed",
          currentStep: "Complete",
        });

        console.log("\nEmotional analysis completed!\n");
        console.log("Metrics:", JSON.stringify(metrics, null, 2));
      })
      .catch(async (error) => {
        console.error("Emotional analysis failed:", error);
        await updateSimulationRun(simulationId, {
          status: "failed",
          errorMessage: error.message,
        });
      });

    return res.status(202).json({
      status: "accepted",
      message: "Emotional analysis started. Check status endpoint for progress.",
      simulationId,
    });
  } catch (error) {
    console.error("Error starting emotional analysis:", error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
