export function generateMetrics(personas) {
  const total = personas.length;
  const featureCounts = {
    age: {},
    gender: {},
    region: {},
    city: {},
    religion: {},
    education: {},
    literacy: {},
    languages: {},
  };

  const ageBins = {
    "18-22": 0,
    "23-27": 0,
    "28-32": 0,
    "33-37": 0,
    "38+": 0,
  };

  personas.forEach((p) => {
    const {
      age,
      gender,
      region,
      city,
      religion,
      education,
      literacy,
      languages,
    } = p;

    // Age binning
    if (age <= 22) ageBins["18-22"]++;
    else if (age <= 27) ageBins["23-27"]++;
    else if (age <= 32) ageBins["28-32"]++;
    else if (age <= 37) ageBins["33-37"]++;
    else ageBins["38+"]++;

    // Count other features
    const features = { gender, region, city, religion, education, literacy };
    for (const key in features) {
      const value = features[key];
      featureCounts[key][value] = (featureCounts[key][value] || 0) + 1;
    }

    // Count languages
    if (Array.isArray(languages)) {
      languages.forEach((lang) => {
        featureCounts.languages[lang] =
          (featureCounts.languages[lang] || 0) + 1;
      });
    }
  });

  const percentage = (count) => ((count / total) * 100).toFixed(1);

  const allTagCandidates = [];
  const completeMetricTags = {};

  // Build completeMetricTags and collect valid (non-zero) tag counts
  for (let feature in featureCounts) {
    const entries = Object.entries(featureCounts[feature]).filter(
      ([_, count]) => count > 0
    );

    completeMetricTags[feature] = entries.map(
      ([value, count]) => `${value} (${percentage(count)}%)`
    );

    entries.forEach(([value, count]) => {
      allTagCandidates.push({
        value,
        percent: percentage(count),
        count,
      });
    });
  }

  // Include age bins in complete metrics and tag candidates (only non-zero)
  const ageEntries = Object.entries(ageBins).filter(([_, count]) => count > 0);
  completeMetricTags.age = ageEntries.map(
    ([range, count]) => `${range} (${percentage(count)}%)`
  );

  ageEntries.forEach(([range, count]) => {
    allTagCandidates.push({
      value: range,
      percent: percentage(count),
      count,
    });
  });

  // Sort and pick top 5 non-zero tags overall
  const highLevelTags = allTagCandidates
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((tag) => `${tag.value} (${tag.percent}%)`);

  return {
    highLevelTags,
    completeMetricTags,
    suggestedName: generateClusterName(highLevelTags),
  };
}

function generateClusterName(tags) {
  return tags
    .slice(0, 3)
    .map((tag) => tag.split("(")[0].trim())
    .join(" · ");
}
