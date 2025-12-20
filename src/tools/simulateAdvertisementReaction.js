import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { clusterResults } from "../global/index.js";
import { config } from "dotenv";
import { clusterReactions } from "../global/index.js";

config();

export const simulateAdvertisementReaction = tool(
  async ({ adDescription }) => {
    clusterReactions.value.length = 0;

    const llm = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      maxOutputTokens: 512,
      apiKey: process.env.GEMINI_API_KEY,
    });
    console.log("clustersResults: ", clusterResults);
    const results = [];
    let count = 0;

    for (const cluster of clusterResults.value?.clusters || []) {
      const personaString = cluster.personas[0]?.description;

      count++;
      const message = [
        new HumanMessage({
          content: [
            {
              type: "text",
              text: `Given the ad description "${adDescription}", simulate a reaction from this persona: ${personaString}. Give a reaction based on their demographic data. Only return the raw reaction as a string.`,
            },
          ],
        }),
      ];

      const result = await llm.invoke(message);

      clusterReactions.value.push({
        cluster: cluster.cluster_id,
        reaction: result.content,
      });

      if (count < 2) {
        results.push(result.content);
      }
    }

    return results;
  },
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
