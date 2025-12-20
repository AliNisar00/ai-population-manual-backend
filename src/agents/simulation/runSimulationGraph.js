import { HumanMessage } from "@langchain/core/messages";
import { simulationAgent, simulationToolNode } from "./simulationAgent.js";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";

function shouldContinue(state) {
  const lastMessage = state.messages.at(-1);
  if (lastMessage?.tool_calls?.length) {
    return "Action";
  }
  return "__end__";
}

export const compiledSimulationGraph = new StateGraph(MessagesAnnotation)
  .addNode("simulationAgent", simulationAgent)
  .addNode("simulationToolNode", simulationToolNode)
  .addEdge("__start__", "simulationAgent")
  .addConditionalEdges("simulationAgent", shouldContinue, {
    Action: "simulationToolNode",
    __end__: "__end__",
  })
  .addEdge("simulationToolNode", "simulationAgent")
  .compile();

// const prompt = new HumanMessage({
//   content: [
//     {
//       type: "text",
//       text: `Get a detailed description of the ad image. cover everything including content, tone, triggers, genre, product, colors, text, picture, feel, strategies etc. and simulate reaction.`,
//     },
//     {
//       type: "image_url",
//       image_url: { url: imageBase64 },
//     },
//   ],
// });

// const result = await builder.invoke({ messages: [prompt] });
