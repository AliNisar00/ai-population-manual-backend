// src/tools/simulateAdvertisementReaction.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { clusterResults, clusterReactions } from "../global/index.js";
import { config } from "dotenv";
import { traceable } from "langsmith/traceable";
import { apiRotator } from "../services/apiRotator.js";
import {
  saveClusterReaction,
  updateSimulationRun,
} from "../services/simulationDbService.js";

config();

export const simulateAdvertisementReaction = tool(
  traceable(
    async ({ adDescription }, { metadata }) => {
      clusterReactions.value.length = 0;

      const { simulationRunId, campaignId } = metadata || {};

      if (!simulationRunId || !campaignId) {
        throw new Error("simulationRunId and campaignId required in metadata");
      }

      console.log("\nGenerating cluster-level reactions...\n");

      const results = [];
      const totalClusters = clusterResults.value?.clusters?.length || 0;

      for (let i = 0; i < totalClusters; i++) {
        const cluster = clusterResults.value.clusters[i];
        const personaString = cluster.personas[0]?.description;

        console.log(
          `Processing cluster ${i + 1}/${totalClusters} (ID: ${cluster.cluster_id})`
        );

        // Update progress
        await updateSimulationRun(simulationRunId, {
          currentStep: `Generating cluster reactions (${i + 1}/${totalClusters})`,
        });

        const message = [
          new HumanMessage(
            `Given the ad description "${adDescription}", simulate a reaction from this persona: ${personaString}. Give a reaction based on their demographic data. Only return the raw reaction as a string.`
          ),
        ];
        
        try {
          const result = await apiRotator.invoke(message);

          const reaction = result.content;

          // Save to DB
          await saveClusterReaction(
            simulationRunId,
            campaignId,
            cluster.cluster_id,
            reaction
          );

          // Also keep in memory for backward compatibility
          clusterReactions.value.push({
            cluster: cluster.cluster_id,
            reaction: reaction,
          });

          if (i < 2) {
            results.push(reaction);
          }

          console.log(`Cluster ${cluster.cluster_id} reaction generated`);
        } catch (error) {
          console.error(`Error with cluster ${cluster.cluster_id}:`, error.message);
          
          // Save error reaction
          const errorReaction = "Error generating reaction";
          await saveClusterReaction(
            simulationRunId,
            campaignId,
            cluster.cluster_id,
            errorReaction
          );

          clusterReactions.value.push({
            cluster: cluster.cluster_id,
            reaction: errorReaction,
          });
        }
      }

      console.log(`\nGenerated ${totalClusters} cluster reactions\n`);

      return results;
    },
    {
      name: "simulate_persona_reaction",
      tags: ["tool", "simulation"],
    }
  ),
  {
    name: "simulate_persona_reaction",
    description:
      "Simulate a persona's reaction to an ad based on their demographic data and ad description. Return the raw reaction as a string.",
    schema: z.object({
      adDescription: z
        .string()
        .describe(
          "Complete generated description of the advertisement to simulate a reaction for"
        ),
    }),
  }
);