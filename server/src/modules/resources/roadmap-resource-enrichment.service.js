import { randomUUID } from 'node:crypto';
import { logger } from '../../infrastructure/logging/logger.js';
import { learningExperienceService } from './assignment/learning-experience.service.js';
import { resourceRankingService } from './ranking/resource-ranking.service.js';

const optionalScoreThreshold = 60;
const concurrency = 3;
const creatorContinuityTolerance = 12;
const creatorContinuityBoost = 15;
const minimumGoalMatch = Object.freeze({
  youtube: 42,
  official_docs: 45,
  github: 58,
});

const defaultLearningResourceTypes = Object.freeze(['playlist', 'course', 'video']);
const defaultFallbackResourceTypes = Object.freeze(['article', 'documentation', 'reference']);
const defaultProjectResourceTypes = Object.freeze(['repository', 'project']);

const resourceTypePreference = Object.freeze({
  playlist: 0,
  course: 1,
  video: 2,
  repository: 3,
  project: 4,
  documentation: 8,
  reference: 9,
  article: 10,
});

function taskEntriesIn(roadmap) {
  return roadmap.phases.flatMap((phase, phaseIndex) =>
    phase.weeks.flatMap((week, weekIndex) =>
      week.tasks.map((task, taskIndex) => ({
        phase,
        phaseIndex,
        week,
        weekIndex,
        task,
        taskIndex,
      })),
    ),
  );
}

function value(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : field;
}

function quickContext(context) {
  if (value(context.mode) !== 'quick') return context;
  const constraints = value(context.constraints);
  return {
    ...context,
    currentProficiency: value(context.currentProficiency)
      ? context.currentProficiency
      : { value: 'beginner' },
    preferredLanguage: value(context.preferredLanguage)
      ? context.preferredLanguage
      : { value: 'English' },
    preferredResourceLanguage: value(context.preferredResourceLanguage)
      ? context.preferredResourceLanguage
      : { value: 'English' },
    learningStyle: value(context.learningStyle) ? context.learningStyle : { value: 'balanced' },
    budget: { value: 0 },
    constraints: {
      value: [
        ...new Set([...(Array.isArray(constraints) ? constraints : []), 'Use only free resources']),
      ],
    },
  };
}

function singleTaskRoadmap(roadmap, task) {
  return {
    ...roadmap,
    phases: [
      {
        ...roadmap.phases[0],
        weeks: [{ ...roadmap.phases[0].weeks[0], tasks: [task] }],
      },
    ],
  };
}

function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function cacheKey(value) {
  return JSON.stringify(value);
}

function taskInput(task) {
  return {
    title: task.title,
    description: task.description,
    difficulty: task.difficulty,
  };
}

function discoveryInput(roadmap, phase, week, task) {
  return {
    roadmap: {
      title: roadmap.title,
      description: roadmap.description,
      summary: roadmap.summary,
      type: roadmap.type,
    },
    phase: {
      title: phase.title,
      description: phase.description,
      objective: phase.objective,
    },
    week: {
      title: week.title,
      description: week.description,
      objective: week.objective,
    },
    task: taskInput(task),
  };
}

function rankingTaskInput(task) {
  return {
    title: task.title,
    description: task.description,
    difficulty: task.difficulty,
    estimatedMinutes: task.estimatedMinutes,
    type: task.type,
  };
}

function contextCacheSignals(context) {
  return {
    mode: value(context.mode),
    currentProficiency: value(context.currentProficiency),
    preferredLanguage: value(context.preferredLanguage),
    preferredResourceLanguage: value(context.preferredResourceLanguage),
    preferredPlatforms: value(context.preferredPlatforms),
    learningStyle: value(context.learningStyle),
    budget: value(context.budget),
    constraints: value(context.constraints),
    primaryGoal: value(context.primaryGoal),
    careerGoal: value(context.careerGoal),
    projectGoal: value(context.projectGoal),
    goalType: value(context.goalType),
  };
}

function isProjectBased(roadmap, task, context) {
  return (
    roadmap.type === 'project' ||
    task.type === 'project' ||
    value(context.goalType) === 'project' ||
    Boolean(value(context.projectGoal))
  );
}

function allowedResourceTypes(roadmap, task, context) {
  return [
    ...defaultLearningResourceTypes,
    ...defaultFallbackResourceTypes,
    ...(isProjectBased(roadmap, task, context) ? defaultProjectResourceTypes : []),
  ];
}

function isDefaultRecommendable(resource, roadmap, task, context) {
  return allowedResourceTypes(roadmap, task, context).includes(resource.type);
}

function isSuitableCandidate(candidate) {
  const score = candidate.scores?.goalMatch;
  if (!Number.isFinite(score)) return true;
  return score >= (minimumGoalMatch[candidate.resource.provider] ?? 45);
}

function applyFallbackPolicy(candidates) {
  const youtube = candidates.filter(
    ({ resource }) =>
      resource.provider === 'youtube' && ['playlist', 'course', 'video'].includes(resource.type),
  );
  if (youtube.length > 0) return youtube;
  const articles = candidates.filter(({ resource }) => resource.type === 'article');
  if (articles.length > 0) return articles;
  const documentation = candidates.filter(({ resource }) =>
    ['documentation', 'reference'].includes(resource.type),
  );
  if (documentation.length > 0) return documentation;
  return candidates.filter(({ resource }) => ['repository', 'project'].includes(resource.type));
}

function mvpResourceScore(candidate) {
  const typeRank = resourceTypePreference[candidate.resource.type] ?? 20;
  const structuredBoost =
    candidate.resource.type === 'playlist' ? 10 : candidate.resource.type === 'course' ? 8 : 0;
  const youtubeBoost = candidate.resource.provider === 'youtube' ? 6 : 0;
  return candidate.overallScore + structuredBoost + youtubeBoost - typeRank;
}

function policyTier(candidate) {
  const resource = candidate.resource;
  if (resource.provider === 'youtube') {
    if (resource.type === 'playlist') return 0;
    if (resource.type === 'course') return 1;
    if (resource.type === 'video') return 2;
  }
  if (resource.type === 'article') return 3;
  if (['documentation', 'reference'].includes(resource.type)) return 4;
  if (['repository', 'project'].includes(resource.type)) return 5;
  return 6;
}

function rerankCandidates(candidates, preferredCreator = null) {
  const best = candidates[0];
  const creatorMatches = preferredCreator
    ? candidates.filter(
        (candidate) => normalized(candidate.resource.author) === normalized(preferredCreator),
      )
    : [];
  const bestCreatorMatch = creatorMatches[0];
  const continuityApplies =
    bestCreatorMatch &&
    (!best || bestCreatorMatch.overallScore >= best.overallScore - creatorContinuityTolerance);

  return candidates
    .map((candidate) => {
      const sameCreator =
        continuityApplies && normalized(candidate.resource.author) === normalized(preferredCreator);
      const continuityScore = sameCreator ? creatorContinuityBoost : 0;
      const adjustedScore = Math.min(100, mvpResourceScore(candidate) + continuityScore);
      return {
        ...candidate,
        overallScore: Math.round(adjustedScore * 100) / 100,
        reasoningMetadata: {
          ...candidate.reasoningMetadata,
          factors: [
            ...(candidate.reasoningMetadata?.factors ?? []),
            {
              signal: 'mvpResourcePolicy',
              score: Math.max(0, Math.min(100, adjustedScore)),
              weight: 0,
              source: 'system_default',
            },
            ...(sameCreator
              ? [
                  {
                    signal: 'creatorContinuity',
                    score: 100,
                    weight: 0,
                    source: 'system_default',
                  },
                ]
              : []),
          ],
          degradedSignals: candidate.reasoningMetadata?.degradedSignals ?? [],
        },
      };
    })
    .sort(
      (left, right) =>
        policyTier(left) - policyTier(right) ||
        right.overallScore - left.overallScore ||
        (resourceTypePreference[left.resource.type] ?? 20) -
          (resourceTypePreference[right.resource.type] ?? 20) ||
        left.resource.canonicalUrl.localeCompare(right.resource.canonicalUrl) ||
        left.resource.resourceId.localeCompare(right.resource.resourceId),
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

async function cached(cache, key, stats, requestField, hitField, factory) {
  if (cache.has(key)) {
    stats[hitField] += 1;
    return cache.get(key);
  }
  stats[requestField] += 1;
  const promise = factory();
  cache.set(key, promise);
  return promise;
}

function recordProviderDiagnostics(target, providers = []) {
  for (const provider of providers) {
    const current = target.get(provider.provider) ?? {
      provider: provider.provider,
      requests: 0,
      succeeded: 0,
      partial: 0,
      failed: 0,
      disabled: 0,
      discovered: 0,
      rejected: 0,
      errorCodes: {},
    };
    current.requests += provider.status === 'disabled' ? 0 : 1;
    current[provider.status] = (current[provider.status] ?? 0) + 1;
    current.discovered += provider.discovered ?? 0;
    current.rejected += provider.rejected ?? 0;
    if (provider.errorCode) {
      current.errorCodes[provider.errorCode] = (current.errorCodes[provider.errorCode] ?? 0) + 1;
    }
    target.set(provider.provider, current);
  }
}

function attachmentType(resource) {
  if (resource.provider === 'youtube' || ['video', 'playlist'].includes(resource.type)) {
    return 'youtube';
  }
  if (resource.provider === 'github' || resource.type === 'repository') return 'github';
  if (/\.pdf(?:$|\?)/i.test(resource.canonicalUrl)) return 'pdf';
  return 'external_url';
}

function resourceLink(candidate, purpose) {
  return {
    resourceId: candidate.resource.resourceId,
    purpose,
    sourceRank: candidate.rank,
    rankingVersion: candidate.rankingVersion,
  };
}

function selectedLinks(task, assignment, candidates) {
  const selected = [];
  const used = new Set();
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.resource.resourceId, candidate]),
  );
  function add(link) {
    if (!link || used.has(link.resourceId) || selected.length >= 4) return;
    used.add(link.resourceId);
    selected.push(link);
  }

  add(assignment.resourceLinks.find((link) => link.purpose === 'primary'));
  add(assignment.resourceLinks.find((link) => link.purpose === 'alternative'));

  if (['practice', 'project'].includes(task.type)) {
    const github = candidates.find(
      (candidate) =>
        candidate.overallScore >= optionalScoreThreshold &&
        (candidate.resource.provider === 'github' || candidate.resource.type === 'repository'),
    );
    add(github ? resourceLink(github, 'github') : null);
  }

  return selected.filter((link) => candidatesById.has(link.resourceId));
}

function attachment(candidate, link, timestamp) {
  const resource = candidate.resource;
  const url = new URL(resource.canonicalUrl);
  return {
    attachmentId: randomUUID(),
    type: attachmentType(resource),
    url: resource.canonicalUrl,
    title: resource.title,
    description: resource.description?.slice(0, 2_000) ?? null,
    metadata: {
      provider: resource.provider,
      host: url.hostname,
      identifier: resource.providerResourceId,
      resourceId: resource.resourceId,
      purpose: link.purpose,
      rankingVersion: link.rankingVersion,
      author: resource.author,
      thumbnailUrl: resource.thumbnailUrl,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function mapWithConcurrency(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return output;
}

export function createRoadmapResourceEnrichmentService({
  discovery,
  ranking = resourceRankingService,
  assignment = learningExperienceService,
  now = () => new Date(),
  log = logger,
} = {}) {
  if (!discovery?.discover) throw new Error('Roadmap resource enrichment requires discovery');
  return Object.freeze({
    async enrich({ learningContext, roadmap, onProgress }) {
      const enriched = structuredClone(roadmap);
      const entries = taskEntriesIn(enriched);
      const tasks = entries.map(({ task }) => task);
      const rankingContext = quickContext(learningContext);
      const timestamp = now().toISOString();
      const startedAt = Date.now();
      const diagnostics = {
        discoveryRequests: 0,
        discoveryCacheHits: 0,
        rankingRequests: 0,
        rankingCacheHits: 0,
        discoveryMs: 0,
        rankingMs: 0,
        assignmentMs: 0,
      };
      const discoveryCache = new Map();
      const rankingCache = new Map();
      const providerDiagnostics = new Map();
      onProgress?.('resource_discovery');
      const rankedByTaskKey = new Map();
      const discoveryPartials = new Map();
      await mapWithConcurrency(entries, async ({ phase, week, task }) => {
        try {
          const input = discoveryInput(enriched, phase, week, task);
          const discoveryKey = cacheKey({
            context: contextCacheSignals(rankingContext),
            input,
          });
          const discoveryStartedAt = Date.now();
          const discovered = await cached(
            discoveryCache,
            discoveryKey,
            diagnostics,
            'discoveryRequests',
            'discoveryCacheHits',
            () =>
              discovery.discover({
                learningContext: rankingContext,
                ...input,
              }),
          );
          diagnostics.discoveryMs += Date.now() - discoveryStartedAt;
          discoveryPartials.set(task.key, discovered.diagnostics.partial);
          recordProviderDiagnostics(providerDiagnostics, discovered.diagnostics.providers);

          let resources = discovered.resources.filter((resource) =>
            isDefaultRecommendable(resource, enriched, task, rankingContext),
          );
          if (value(learningContext.mode) === 'quick') {
            const free = resources.filter((resource) =>
              ['free', 'mixed'].includes(resource.accessType),
            );
            resources =
              free.length > 0
                ? free
                : resources.filter((resource) => resource.accessType !== 'paid');
          }
          if (resources.length === 0) {
            rankedByTaskKey.set(task.key, []);
            return { prepared: false, partial: discovered.diagnostics.partial };
          }

          onProgress?.('resource_ranking');
          const rankingKey = cacheKey({
            context: contextCacheSignals(rankingContext),
            task: rankingTaskInput(task),
            resources: resources.map((resource) => resource.resourceId).sort(),
          });
          const rankingStartedAt = Date.now();
          const ranked = await cached(
            rankingCache,
            rankingKey,
            diagnostics,
            'rankingRequests',
            'rankingCacheHits',
            () =>
              ranking.rank({
                learningContext: rankingContext,
                task: rankingTaskInput(task),
                resources,
              }),
          );
          diagnostics.rankingMs += Date.now() - rankingStartedAt;
          const suitableCandidates = applyFallbackPolicy(
            ranked.candidates.filter(isSuitableCandidate),
          );
          rankedByTaskKey.set(task.key, suitableCandidates);
          return {
            prepared: suitableCandidates.length > 0,
            partial: discovered.diagnostics.partial,
          };
        } catch (error) {
          log.warn(
            { taskKey: task.key, errorCode: error?.code ?? 'RESOURCE_ENRICHMENT_FAILED' },
            'Roadmap task resource enrichment degraded',
          );
          rankedByTaskKey.set(task.key, []);
          discoveryPartials.set(task.key, true);
          return { prepared: false, partial: true };
        }
      });

      const creatorByPhaseAndLevel = new Map();
      onProgress?.('resource_attachment');
      const assignmentStartedAt = Date.now();
      const results = entries.map(({ phase, phaseIndex, task }) => {
        try {
          const phaseKey = phase.key ?? `phase-${phaseIndex + 1}`;
          const continuityKey = `${phaseKey}:${task.difficulty}`;
          const preferredCreator = creatorByPhaseAndLevel.get(continuityKey) ?? null;
          const rankedCandidates = rerankCandidates(
            rankedByTaskKey.get(task.key) ?? [],
            preferredCreator,
          );
          if (rankedCandidates.length === 0) {
            return { attached: 0, partial: discoveryPartials.get(task.key) ?? true };
          }

          const assignmentResult = assignment.assign({
            learningContext: rankingContext,
            roadmap: singleTaskRoadmap(enriched, task),
            rankedCandidatesByTask: [{ taskKey: task.key, candidates: rankedCandidates }],
          });
          const links = selectedLinks(task, assignmentResult.assignments[0], rankedCandidates);
          const candidatesById = new Map(
            rankedCandidates.map((candidate) => [candidate.resource.resourceId, candidate]),
          );
          task.resources = links;
          task.attachments = links.map((link) =>
            attachment(candidatesById.get(link.resourceId), link, timestamp),
          );
          const primary = links.find((link) => link.purpose === 'primary');
          const primaryCreator = primary
            ? candidatesById.get(primary.resourceId)?.resource.author
            : null;
          if (primaryCreator) creatorByPhaseAndLevel.set(continuityKey, primaryCreator);
          return { attached: links.length, partial: discoveryPartials.get(task.key) ?? false };
        } catch (error) {
          log.warn(
            { taskKey: task.key, errorCode: error?.code ?? 'RESOURCE_ENRICHMENT_FAILED' },
            'Roadmap task resource enrichment degraded',
          );
          return { attached: 0, partial: true };
        }
      });
      diagnostics.assignmentMs += Date.now() - assignmentStartedAt;

      return {
        roadmap: enriched,
        diagnostics: {
          taskCount: tasks.length,
          enrichedTaskCount: results.filter((result) => result.attached > 0).length,
          attachmentCount: results.reduce((total, result) => total + result.attached, 0),
          partial: results.some((result) => result.partial || result.attached === 0),
          recommendationStrategy: {
            primary: 'youtube_first',
            preferredOrder: [
              'playlist',
              'course',
              'video',
              'article',
              'documentation',
              'repository_if_project_based',
            ],
            minimumGoalMatch: { ...minimumGoalMatch },
            creatorContinuity: 'phase_and_level',
          },
          providers: [...providerDiagnostics.values()].sort((left, right) =>
            left.provider.localeCompare(right.provider),
          ),
          performance: {
            totalMs: Date.now() - startedAt,
            discoveryMs: diagnostics.discoveryMs,
            rankingMs: diagnostics.rankingMs,
            assignmentMs: diagnostics.assignmentMs,
            discoveryRequests: diagnostics.discoveryRequests,
            discoveryCacheHits: diagnostics.discoveryCacheHits,
            rankingRequests: diagnostics.rankingRequests,
            rankingCacheHits: diagnostics.rankingCacheHits,
            aiCalls: 0,
            externalProviderRequests: [...providerDiagnostics.values()].reduce(
              (total, provider) => total + provider.requests,
              0,
            ),
          },
        },
      };
    },
  });
}
