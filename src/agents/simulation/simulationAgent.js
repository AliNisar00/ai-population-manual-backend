import { config } from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { simulateAdvertisementReaction } from "../../tools/simulateAdvertisementReaction.js";
import { generatePersonaReactions } from "../../tools/generatePersonaReaction.js";

config();

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  maxOutputTokens: 2048,
  apiKey: process.env.GEMINI_API_KEY,
});

const tools = [simulateAdvertisementReaction, generatePersonaReactions];
const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));
const llmWithTools = llm.bindTools(tools);

export async function simulationAgent(state) {
  console.log("Agent called, messages:", state.messages.length);
  const systemMessage = [
    new SystemMessage(`You are a simulation agent. Analyze the advertisement image and then use the available tools.

First, describe the ad in detail and use the campaign details to make the description.
Then call simulate_persona_reaction with your description.
then call generate_persona_reactions.

You must use both tools.`),
  ];

  const response = await llmWithTools.invoke([
    ...systemMessage,
    ...state.messages,
  ]);

  console.log("Agent response tool calls:", response.tool_calls?.length || 0);
  return {
    messages: [response],
  };
}

export async function simulationToolNode(state) {
  const resultMessages = [];
  const lastMessage = state.messages.at(-1);

  if (lastMessage?.tool_calls?.length) {
    for (const toolcall of lastMessage.tool_calls) {
      console.log(`Executing tool: ${toolcall.name}`);
      const tool = toolsByName[toolcall.name];

      try {
        const result = await tool.invoke(toolcall.args);
        console.log(`Tool result: ${result}`);

        resultMessages.push(
          new ToolMessage({
            tool_call_id: toolcall.id,
            name: toolcall.name,
            content:
              typeof result === "string" ? result : JSON.stringify(result),
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
