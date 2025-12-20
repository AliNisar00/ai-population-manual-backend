import { getClustersWithData } from "../services/clusterService.js";
import {
  clusterResults,
  clusterReactions,
  personaReactions,
} from "../global/index.js";

/**
 * Populates legacy global simulation state using the manual backend.
 * This recreates the runtime assumptions of the old LLM pipeline.
 */
export async function bootstrapSimulationState({ campaignId }) {
  console.log("Bootstrapping simulation global state...");

  // 1. Fetch clusters + personas from manual backend
  const { clusters } = await getClustersWithData();

  if (!clusters || clusters.length === 0) {
    throw new Error("No clusters available to bootstrap simulation state.");
  }

  // 2. Transform into legacy-compatible shape
  const transformedClusters = clusters.map((cluster) => ({
    cluster_id: cluster.cluster_id, // IMPORTANT: simulation expects numeric cluster_id
    personas: cluster.personas.map((p) => ({
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

      // Optional but used if present by generatePersonaReactions
      tone: p.tone ?? null,
    })),
  }));

  // 3. Populate global store
  clusterResults.value = {
    campaignId,
    clusters: transformedClusters,
  };

  // 4. Reset downstream simulation state
  clusterReactions.value.length = 0;
  personaReactions.value.length = 0;

  console.log(
    `Simulation state ready: ${transformedClusters.length} clusters, ` +
      `${transformedClusters.reduce(
        (sum, c) => sum + c.personas.length,
        0
      )} personas`
  );
}
