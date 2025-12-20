export function analyzerMetrics(emotionalAnalysisResults) {
  const total = emotionalAnalysisResults.length;

  const sentimentCounts = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  const emotionCounts = {}; // e.g. { joy: 3, disgust: 4 }
  const clusterMap = {}; // cluster_id -> personas

  let cumulativeIntensity = 0;

  for (const result of emotionalAnalysisResults) {
    const {
      cluster_id,
      emotion_analysis: { dominant_emotion, sentiment, intensity },
    } = result;

    // Count sentiment
    sentimentCounts[sentiment]++;

    // Count dominant emotions
    emotionCounts[dominant_emotion] =
      (emotionCounts[dominant_emotion] || 0) + 1;

    // Cluster grouping
    if (!clusterMap[cluster_id]) clusterMap[cluster_id] = [];
    clusterMap[cluster_id].push(result);

    cumulativeIntensity += intensity;
  }

  const sentimentPercentages = Object.fromEntries(
    Object.entries(sentimentCounts).map(([key, count]) => [
      key,
      ((count / total) * 100).toFixed(1) + "%",
    ])
  );

  const topEmotions = Object.entries(emotionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([emotion, count]) => ({
      emotion,
      count,
      percent: ((count / total) * 100).toFixed(1) + "%",
    }));

  const averageIntensity = (cumulativeIntensity / total).toFixed(1);

  const clusterSummaries = Object.entries(clusterMap).map(
    ([clusterId, personas]) => {
      const emotionSummary = {};
      personas.forEach((p) => {
        const e = p.emotion_analysis.dominant_emotion;
        emotionSummary[e] = (emotionSummary[e] || 0) + 1;
      });

      const dominantInCluster = Object.entries(emotionSummary).sort(
        (a, b) => b[1] - a[1]
      )[0];

      return {
        cluster_id: Number(clusterId),
        persona_count: personas.length,
        dominant_emotion: dominantInCluster?.[0] || "unknown",
        tag: `${dominantInCluster?.[0] || "unknown"}-leaning cluster`,
      };
    }
  );

  // Tags for dashboard
  const highLevelTags = [
    ...topEmotions.map((e) => e.emotion),
    ...Object.entries(sentimentCounts)
      .filter(([_, count]) => count > 0)
      .map(([s]) => `${s} sentiment`),
    `Avg intensity: ${averageIntensity}`,
  ];

  return {
    total_personas: total,
    sentiment_breakdown: sentimentPercentages,
    top_emotions: topEmotions,
    average_intensity: averageIntensity,
    cluster_summaries: clusterSummaries,
    high_level_tags: highLevelTags,
  };
}
