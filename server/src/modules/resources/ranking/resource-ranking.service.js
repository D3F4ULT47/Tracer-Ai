import { logger } from '../../../infrastructure/logging/logger.js';
import { resourceRepository } from '../resource.repository.js';
import { validateRankingResult } from '../resource.validator.js';
import { qualityWeights, rankingWeights, RANKING_VERSION } from './ranking.config.js';
import { validateRankingInput } from './ranking.input.js';
import { createDefaultScoringRules } from './scoring-rules.js';
import { ScoringRuleRegistry } from './scoring-rule.registry.js';

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function weighted(scores, weights) {
  return rounded(
    Object.entries(weights).reduce((total, [name, weight]) => total + scores[name] * weight, 0),
  );
}

function defaultRegistry() {
  const registry = new ScoringRuleRegistry();
  for (const rule of createDefaultScoringRules()) registry.register(rule);
  return registry;
}

function stableCompare(left, right) {
  return (
    right.overallScore - left.overallScore ||
    right.scores.qualityScore - left.scores.qualityScore ||
    left.resource.canonicalUrl.localeCompare(right.resource.canonicalUrl) ||
    left.resource.resourceId.localeCompare(right.resource.resourceId)
  );
}

export function createResourceRankingService({
  registry = defaultRegistry(),
  repository = resourceRepository,
  now = () => new Date(),
  log = logger,
} = {}) {
  return Object.freeze({
    async rank(input) {
      const validated = validateRankingInput(input);
      const rankingTime = now();
      const candidates = validated.resources.map((resource) => {
        const scores = {};
        const factors = [];
        const degradedSignals = [];
        for (const rule of registry.list()) {
          let scored;
          try {
            scored = rule.score({
              resource,
              task: validated.task,
              learningContext: validated.learningContext,
              now: rankingTime,
            });
            if (!Number.isFinite(scored?.score) || scored.score < 0 || scored.score > 100) {
              throw new Error('Scoring rule returned an out-of-range value');
            }
          } catch {
            degradedSignals.push(rule.name);
            log.warn(
              { signal: rule.name, resourceId: resource.resourceId },
              'Resource score degraded',
            );
            scored = { score: 50, source: 'system_default' };
          }
          scores[rule.name] = rounded(scored.score);
          factors.push({
            signal: rule.name,
            score: rounded(scored.score),
            weight: rankingWeights[rule.name] ?? 0,
            source: scored.source ?? rule.source ?? 'system_default',
          });
        }
        scores.qualityScore = weighted(scores, qualityWeights);
        const rankedResource = {
          ...resource,
          authorityScore: scores.authorityScore,
          freshnessScore: scores.freshnessScore,
          popularityScore: scores.popularityScore,
          completenessScore: scores.completenessScore,
          providerConfidenceScore: scores.providerConfidenceScore,
          qualityScore: scores.qualityScore,
          qualityScoringVersion: RANKING_VERSION,
        };
        return {
          resource: rankedResource,
          scores,
          overallScore: weighted(scores, rankingWeights),
          reasoningMetadata: { factors, degradedSignals },
          rankingVersion: RANKING_VERSION,
        };
      });
      candidates.sort(stableCompare);
      try {
        await repository.updateQualitySignals(
          candidates.map((candidate) => ({
            resourceId: candidate.resource.resourceId,
            rankingVersion: RANKING_VERSION,
            signals: {
              authorityScore: candidate.scores.authorityScore,
              freshnessScore: candidate.scores.freshnessScore,
              popularityScore: candidate.scores.popularityScore,
              completenessScore: candidate.scores.completenessScore,
              providerConfidenceScore: candidate.scores.providerConfidenceScore,
              qualityScore: candidate.scores.qualityScore,
            },
          })),
        );
      } catch (error) {
        log.warn({ err: error }, 'Reusable resource quality metadata could not be persisted');
        for (const candidate of candidates) {
          candidate.reasoningMetadata.degradedSignals.push('qualityPersistence');
        }
      }
      const result = {
        candidates: candidates.map((candidate, index) => ({ ...candidate, rank: index + 1 })),
        rankingVersion: RANKING_VERSION,
        generatedAt: rankingTime.toISOString(),
      };
      return validateRankingResult(result);
    },
  });
}

export const resourceRankingService = createResourceRankingService();
