// src/agents/simulation/simulationAgent.js
import { config } from "dotenv";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { simulateAdvertisementReaction } from "../../tools/simulateAdvertisementReaction.js";
import { generatePersonaReactions } from "../../tools/generatePersonaReaction.js";
import { apiRotator } from "../../services/apiRotator.js";

config();

const tools = [simulateAdvertisementReaction, generatePersonaReactions];
const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));

// Helper function to check if any message has an image
function hasImageContent(messages) {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === "image_url") {
          return true;
        }
      }
    }
  }
  return false;
}

// Helper function to strip images from messages (for subsequent agent calls)
function stripImages(messages) {
  return messages.map((msg) => {
    if (Array.isArray(msg.content)) {
      const textOnly = msg.content.filter((item) => item.type !== "image_url");
      // Always convert to string for Groq compatibility
      if (textOnly.length === 0) {
        return { ...msg, content: "" };
      }
      if (textOnly.length === 1) {
        return { ...msg, content: textOnly[0].text };
      }
      // Multiple text items - concatenate them
      return { ...msg, content: textOnly.map(item => item.text).join("\n") };
    }
    return msg;
  });
}

export async function simulationAgent(state) {
  console.log("Agent called, messages:", state.messages.length);

  const systemMessage = [
    new SystemMessage(`You are a simulation agent. Analyze the advertisement image and then use the available tools.
First, describe the ad in detail and use the campaign details to make the description.
Then call simulate_persona_reaction with your description.
Then call generate_persona_reactions.
You must use both tools in sequence.`),
  ];

  // Check if this is the first call (has image) or subsequent call (text only)
  const hasImage = hasImageContent(state.messages);

  let response;
  
  if (hasImage) {
    console.log("First agent call - using vision model for image analysis");
    
    // Bind tools to the vision client
    const llmWithTools = apiRotator.visionClient.bindTools(tools);
    
    response = await llmWithTools.invoke([
      ...systemMessage,
      ...state.messages,
    ]);
  } else {
    console.log("Subsequent agent call - using text-only API rotation");
    
    // Strip any images from message history (shouldn't be any, but just in case)
    const textOnlyMessages = stripImages(state.messages);
    
    // Get available API and bind tools
    const api = await apiRotator.getAvailableAPI();
    const llmWithTools = api.client.bindTools(tools);
    
    api.requestsThisMinute++;
    api.requestsToday++;
    
    console.log(
      `Using API ${api.id} (${api.config.type}): ${api.requestsThisMinute}/${api.config.rpm} RPM, ${api.requestsToday}/${api.config.rpd} RPD`
    );
    
    response = await llmWithTools.invoke([
      ...systemMessage,
      ...textOnlyMessages,
    ]);
    
    // Add delay
    const delayMs = Math.ceil(60000 / api.config.rpm);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log("🔧 Agent response tool calls:", response.tool_calls?.length || 0);

  // Important: Strip images from the response content to prevent them from propagating
  if (Array.isArray(response.content)) {
    const textOnly = response.content.filter((item) => item.type !== "image_url");
    if (textOnly.length === 1 && textOnly[0].type === "text") {
      response.content = textOnly[0].text;
    } else {
      response.content = textOnly;
    }
  }

  return {
    messages: [response],
  };
}

export async function simulationToolNode(state) {
  const resultMessages = [];
  const lastMessage = state.messages.at(-1);

  // Get metadata from state
  const { simulationRunId, campaignId } = state;

  if (lastMessage?.tool_calls?.length) {
    for (const toolcall of lastMessage.tool_calls) {
      console.log(`🔨 Executing tool: ${toolcall.name}`);
      const tool = toolsByName[toolcall.name];
      try {
        // Pass metadata to tool
        const result = await tool.invoke(toolcall.args, {
          metadata: { simulationRunId, campaignId },
        });

        console.log(`Tool result: ${typeof result === 'string' ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100)}...`);

        resultMessages.push(
          new ToolMessage({
            tool_call_id: toolcall.id,
            name: toolcall.name,
            content: typeof result === "string" ? result : JSON.stringify(result),
          })
        );
      } catch (err) {
        console.error(`Error invoking tool "${toolcall.name}":`, err);
        resultMessages.push(
          new ToolMessage({
            tool_call_id: toolcall.id,
            name: toolcall.name,
            content: `Tool "${toolcall.name}" failed: ${err.message}`,
          })
        );
      }
    }
  }

  return {
    messages: resultMessages,
  };
}
