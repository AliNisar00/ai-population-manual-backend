import { getClustersWithData } from "../services/clusterService.js";
import {
  clusterResults,
  clusterReactions,
  personaReactions,
} from "../global/index.js";

/**
 * Populates legacy global simulation state using the manual backend.
 * This recreates the runtime assumptions of the old LLM pipeline.
 * But compared to the regular bootstrapSimulationState.js, this file limits personas to 
 * the specified number provided at the time of calling to allow simulation pipeline to work
 * with LLMs on free tier.
 */

export async function bootstrapSimulationState_limitedPersonas({ campaignId, personaLimit }) {
  console.log("Bootstrapping simulation global state...");

  const { clusters } = await getClustersWithData();
  if (!clusters || clusters.length === 0) {
    throw new Error("No clusters available to bootstrap simulation state.");
  }

  // Keep track of total personas added
  let personasAdded = 0;

  const transformedClusters = clusters.map((cluster) => {
    const remaining = personaLimit ? personaLimit - personasAdded : Infinity;

    // Slice personas to respect limit
    const limitedPersonas = cluster.personas.slice(0, remaining);

    personasAdded += limitedPersonas.length;

    return {
      cluster_id: cluster.cluster_id,
      personas: limitedPersonas.map((p) => ({
        persona_id: p.persona_id,
        name: p.name,
        description: p.description,
        age: p.age,
        gender: p.gender,
        education: p.education,
        region: p.region,
        city: p.city,
        religion: p.religion,
        languages: p.languages,
        literacy: p.literacy,
        tone: p.tone ?? null,
      })),
    };
  });

  clusterResults.value = { campaignId, clusters: transformedClusters };
  clusterReactions.value.length = 0;
  personaReactions.value.length = 0;

  console.log(
    `Simulation state ready: ${transformedClusters.length} clusters, ` +
      `${transformedClusters.reduce((sum, c) => sum + c.personas.length, 0)} personas`
  );
}
