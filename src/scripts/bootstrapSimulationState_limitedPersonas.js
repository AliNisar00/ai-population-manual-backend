import { traceable } from "langsmith/traceable";
import { getClustersWithData } from "../services/clusterService.js";
import {
  clusterResults,
  clusterReactions,
  personaReactions,
} from "../global/index.js";

/**
 * Bootstraps legacy global simulation state
 * with an optional persona limit (for free-tier safety).
 */

export const bootstrapSimulationState_limitedPersonas = traceable(
  async ({ campaignId, personaLimit }) => {
    console.log("Bootstrapping simulation global state...");

    const { clusters } = await getClustersWithData();
    if (!clusters || clusters.length === 0) {
      throw new Error("No clusters available to bootstrap simulation state.");
    }

    let personasAdded = 0;
    const transformedClusters = [];

    for (const cluster of clusters) {
      if (personaLimit && personasAdded >= personaLimit) break;

      const remaining =
        personaLimit ? personaLimit - personasAdded : Infinity;

      const limitedPersonas = cluster.personas.slice(0, remaining);

      if (limitedPersonas.length === 0) continue;

      personasAdded += limitedPersonas.length;

      transformedClusters.push({
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
      });
    }

    clusterResults.value = {
      campaignId,
      clusters: transformedClusters,
    };

    clusterReactions.value.length = 0;
    personaReactions.value.length = 0;

    console.log(
      `Simulation state ready: ${transformedClusters.length} clusters, ${personasAdded} personas`
    );
  },
  {
    name: "bootstrap_simulation_state_limited",
    tags: ["bootstrap", "state"],
  }
);
