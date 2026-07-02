export const RANKING_VERSION = '1.0.0';

export const rankingWeights = Object.freeze({
  authorityScore: 0.16,
  freshnessScore: 0.06,
  popularityScore: 0.07,
  difficultyMatch: 0.16,
  learningStyleMatch: 0.1,
  preferredPlatformMatch: 0.08,
  languageMatch: 0.08,
  estimatedTimeMatch: 0.08,
  completenessScore: 0.05,
  providerConfidenceScore: 0.04,
  goalMatch: 0.07,
  budgetMatch: 0.05,
});

export const qualityWeights = Object.freeze({
  authorityScore: 0.35,
  freshnessScore: 0.2,
  popularityScore: 0.2,
  completenessScore: 0.15,
  providerConfidenceScore: 0.1,
});
