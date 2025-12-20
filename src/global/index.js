// src/global/index.js

/**
 * GLOBAL SIMULATION STATE
 * -----------------------
 * This file intentionally uses process-wide mutable state
 * to preserve compatibility with the legacy simulation pipeline.
 *
 * NOTE: Not concurrency-safe
 * NOTE: Single active simulation assumed
 */

/**
 * Holds cluster + persona structure
 * Written by: bootstrapSimulationState
 * Read by: simulation tools / LLM graph
 */
export const clusterResults = {
  value: null,
};

/**
 * Holds cluster-level reaction summaries
 * Written by: generateClusterReactions tool
 */
export const clusterReactions = {
  value: [],
};

/**
 * Holds persona-level emotional reactions
 * Written by: generatePersonaReactions tool
 * Read by: emotionalAnalyzer
 */
export const personaReactions = {
  value: [],
};
