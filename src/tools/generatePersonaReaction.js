// src/tools/generatePersonaReaction.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import {
  clusterResults,
  clusterReactions,
  personaReactions,
} from "../global/index.js";
import { config } from "dotenv";
import { traceable } from "langsmith/traceable";
import { apiRotator } from "../services/apiRotator.js";
import {
  savePersonaReaction,
  updateSimulationRun,
} from "../services/simulationDbService.js";

config();

export const generatePersonaReactions = tool(
  traceable(
    async ({}, { metadata }) => {
      console.log("\nGenerating persona-level reactions...\n");
      
      personaReactions.value.length = 0;

      const { simulationRunId, campaignId } = metadata || {};

      if (!simulationRunId || !campaignId) {
        throw new Error("simulationRunId and campaignId required in metadata");
      }

      if (clusterReactions.value.length === 0) {
        return "No cluster reactions available. Please run simulate_persona_reaction first.";
      }

      // Build batch of all personas
      const batchRequests = [];

      clusterReactions.value.forEach((clusterReaction) => {
        const cluster = clusterResults.value.clusters.find(
          (c) => c.cluster_id === clusterReaction.cluster
        );
        if (cluster) {
          cluster.personas.forEach((persona) => {
            batchRequests.push({
              clusterId: cluster.cluster_id,
              personaId: persona.persona_id,
              persona,
              clusterReaction: clusterReaction.reaction,
            });
          });
        }
      });

      const totalPersonas = batchRequests.length;
      console.log(`Processing ${totalPersonas} total personas...\n`);

      // Process one persona at a time with API rotation
      for (let i = 0; i < batchRequests.length; i++) {
        const request = batchRequests[i];
        const tone = request.persona.tone;

        console.log(
          `Processing persona ${i + 1}/${totalPersonas}: ${request.persona.name} (${request.personaId})`
        );

        // Update progress in DB
        await updateSimulationRun(simulationRunId, {
          processedPersonas: i,
          currentStep: `Generating persona reactions (${i + 1}/${totalPersonas})`,
        });

        const prompt = `Given the cluster reaction: "${request.clusterReaction}"

Generate a personalized reaction for this persona:

Name: ${request.persona.name}
Description: ${request.persona.description}
Tone Characteristics:
- Emotional responsiveness: ${tone?.emotional_responsiveness ?? "neutral"}
- Temperament: ${tone?.temperament ?? "neutral"}
- Communication style: ${tone?.communication_style ?? "neutral"}
- Language mix: ${tone?.language_mix ?? "neutral"}
- Attitude towards ads: ${tone?.attitude_towards_ads ?? "neutral"}
- Positive triggers: ${
          tone?.key_reaction_triggers?.positive?.join(", ") ?? "N/A"
        }
- Negative triggers: ${
          tone?.key_reaction_triggers?.negative?.join(", ") ?? "N/A"
        }

Return ONLY the raw reaction text, nothing else.`;

        const message = [
          new HumanMessage(prompt)
        ];

        try {
          const result = await apiRotator.invoke(message);
          const reaction = result.content.trim();

          // Save to DB immediately
          await savePersonaReaction({
            simulationRunId,
            campaignId,
            clusterId: request.clusterId,
            personaId: request.personaId,
            personaName: request.persona.name,
            rawReaction: reaction,
          });

          // Also keep in memory for emotional analyzer
          personaReactions.value.push({
            cluster_id: request.clusterId,
            persona_id: request.personaId,
            personaName: request.persona.name,
            reaction,
          });

          console.log(`Persona ${request.personaId} reaction saved`);
        } catch (err) {
          console.error(
            `Error processing persona ${request.personaId}:`,
            err.message
          );

          // Save error reaction
          await savePersonaReaction({
            simulationRunId,
            campaignId,
            clusterId: request.clusterId,
            personaId: request.personaId,
            personaName: request.persona.name,
            rawReaction: "Error generating reaction",
          });

          personaReactions.value.push({
            cluster_id: request.clusterId,
            persona_id: request.personaId,
            personaName: request.persona.name,
            reaction: "Error generating reaction",
          });
        }

        // Log progress every 50 personas
        if ((i + 1) % 50 === 0 || i + 1 === totalPersonas) {
          const percent = Math.round(((i + 1) / totalPersonas) * 100);
          const apiStatus = apiRotator.getStatus();
          
          console.log(`\nProgress: ${i + 1}/${totalPersonas} (${percent}%)`);
          console.log("API Status:");
          apiStatus.forEach((api) => {
            console.log(
              `   API ${api.id} (${api.type}): ${api.requestsThisMinute}/${api.rpm} RPM, ${api.requestsToday}/${api.rpd} RPD`
            );
          });
          console.log("");
        }
      }

      // Final update
      await updateSimulationRun(simulationRunId, {
        processedPersonas: totalPersonas,
      });

      console.log(`\nAll ${totalPersonas} persona reactions generated!\n`);

      return `Generated ${personaReactions.value.length} persona reactions based on cluster reactions`;
    },
    { name: "generate_persona_reactions", tags: ["tool", "simulation"] }
  ),
  {
    name: "generate_persona_reactions",
    description:
      "Generate personalized reactions for each persona based on cluster reactions from simulate_persona_reaction tool",
    schema: z.object({}),
  }
);