import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import {
  clusterResults,
  clusterReactions,
  personaReactions,
} from "../global/index.js";
import { config } from "dotenv";
import { traceable } from "langsmith/traceable";

config();

export const generatePersonaReactions = tool(
  traceable(
    async () => {
      console.log("Using cluster reactions from first tool...");
      personaReactions.value.length = 0;

      if (clusterReactions.value.length === 0) {
        return "No cluster reactions available. Please run simulate_persona_reaction first.";
      }

      const llm = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        maxOutputTokens: 512,
        apiKey: process.env.GEMINI_API_KEY,
      });

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

      console.log(
        `Processing ${batchRequests.length} persona reactions in batches of 10...`
      );

      // for (let i = 0; i < batchRequests.length; i += 10) {
      //   const batch = batchRequests.slice(i, i + 10);
      for (let i = 0; i < batchRequests.length; i++) {
        const batch = [batchRequests[i]]; // one persona per call
        console.log(
          `Batch ${Math.floor(i / 10) + 1}/${Math.ceil(
            batchRequests.length / 10
          )}`
        );

        let batchPrompt = `Given the cluster reaction: "${batch[0].clusterReaction}"\n\nGenerate personalized reactions for the following personas:\n\n`;

        batch.forEach((request, index) => {
          const tone = request.persona.tone;
          batchPrompt += `${index + 1}. Persona: ${request.persona.name}
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

`;
        });

        batchPrompt += `Return responses in this exact format:\n\n`;
        batch.forEach((request, index) => {
          batchPrompt += `PERSONA_${index + 1}: [reaction for ${
            request.persona.name
          }]\n`;
        });

        const message = [
          new HumanMessage({
            content: [
              {
                type: "text",
                text: batchPrompt,
              },
            ],
          }),
        ];

        try {
          const result = await llm.invoke(message);

          console.log("=== RAW GEMINI OUTPUT ===");
          console.log(result.content);
          console.log("=========================");

          const lines = result.content.split("\n");

          batch.forEach((request, index) => {
            const key = `PERSONA_${index + 1}:`;
            const line = lines.find((l) => l.startsWith(key));
            const reaction = line
              ? line.replace(key, "").trim()
              : "Failed to parse reaction";

            personaReactions.value.push({
              cluster_id: request.clusterId,
              persona_id: request.personaId,
              personaName: request.persona.name,
              reaction,
            });
          });

          console.log(`✅ Processed ${batch.length} personas in this batch`);

          if (i + 10 < batchRequests.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (err) {
          console.error("❌ Error processing batch:", err);
          batch.forEach((request) => {
            personaReactions.value.push({
              cluster_id: request.clusterId,
              persona_id: request.personaId,
              personaName: request.persona.name,
              reaction: "Error generating reaction",
            });
          });
        }
      }

      console.log(`🎯 Total Persona Reactions: ${personaReactions.value.length}`);
      return `Generated ${personaReactions.value.length} persona reactions based on fresh cluster reactions`;
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
