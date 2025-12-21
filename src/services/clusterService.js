import { generateMetrics } from "../helpers/generateMetrics.js";
import {
  getClusters,
  getClusterMembers
} from "../db/personaRepository.js";

export async function getClustersWithData() {
  console.log("🔍 Service: Fetching clusters with personas...");

  // 0. Define campaignId = 1 (hardcoded as the original backend)
  const campaignId = 1;

  // 1. Fetch raw data
  const clusterRows = await getClusters();
  const memberRows = await getClusterMembers();

  // 2. Nest members into clusters
  const clusters = clusterRows.map((cluster) => {
    let factors = [];
    try {
      factors = typeof cluster.leading_factors === "string"
        ? JSON.parse(cluster.leading_factors)
        : cluster.leading_factors;
    } catch {
      factors = [];
    }

    const members = memberRows.filter(
      (m) => m.cluster_id === cluster.id
    );

    return {
      cluster_id: cluster.cluster_label,
      db_id: cluster.id,
      size: cluster.size,
      leading_factors: factors,
      personas: members,
    };
  });

  // 3. Metrics
  const allPersonas = clusters.flatMap((c) => c.personas);

  const targetMarketMetrics = generateMetrics(allPersonas);

  const clusterMetrics = clusters.map((cluster) => ({
    cluster_id: cluster.cluster_id,
    metrics: generateMetrics(cluster.personas),
  }));

  return {
    clusters,
    targetMarketMetrics,
    clusterMetrics,
    campaignId,
  };
}
