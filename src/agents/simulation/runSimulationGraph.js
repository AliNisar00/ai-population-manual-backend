// src/agents/simulation/simulationGraph.js
import { simulationAgent, simulationToolNode } from "./simulationAgent.js";
import { StateGraph, Annotation } from "@langchain/langgraph";
import { MessagesAnnotation } from "@langchain/langgraph";

// Extend MessagesAnnotation to include simulation metadata
const SimulationState = Annotation.Root({
  ...MessagesAnnotation.spec,
  simulationRunId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  campaignId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

function shouldContinue(state) {
  const lastMessage = state.messages.at(-1);
  if (lastMessage?.tool_calls?.length) {
    return "Action";
  }
  return "__end__";
}

export const compiledSimulationGraph = new StateGraph(SimulationState)
  .addNode("simulationAgent", simulationAgent)
  .addNode("simulationToolNode", simulationToolNode)
  .addEdge("__start__", "simulationAgent")
  .addConditionalEdges("simulationAgent", shouldContinue, {
    Action: "simulationToolNode",
    __end__: "__end__",
  })
  .addEdge("simulationToolNode", "simulationAgent")
  .compile();
  