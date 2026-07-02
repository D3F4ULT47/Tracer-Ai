import { randomUUID } from 'node:crypto';
import { logger } from '../../infrastructure/logging/logger.js';
import { learningExperienceService } from './assignment/learning-experience.service.js';
import { resourceRankingService } from './ranking/resource-ranking.service.js';

const optionalScoreThreshold = 60;
const concurrency = 3;

function tasksIn(roadmap) {
  return roadmap.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.tasks));
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

function selectedLinks(assignment, candidates) {
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

  const officialDocumentation = candidates.find(
    (candidate) =>
      candidate.overallScore >= optionalScoreThreshold &&
      ['documentation', 'reference'].includes(candidate.resource.type),
  );
  add(officialDocumentation ? resourceLink(officialDocumentation, 'reference') : null);

  const github = candidates.find(
    (candidate) =>
      candidate.overallScore >= optionalScoreThreshold &&
      (candidate.resource.provider === 'github' || candidate.resource.type === 'repository'),
  );
  add(github ? resourceLink(github, 'github') : null);

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
    async enrich({ learningContext, roadmap }) {
      const enriched = structuredClone(roadmap);
      const tasks = tasksIn(enriched);
      const rankingContext = quickContext(learningContext);
      const timestamp = now().toISOString();
      const results = await mapWithConcurrency(tasks, async (task) => {
        try {
          const discovered = await discovery.discover({
            learningContext: rankingContext,
            task: {
              title: task.title,
              description: task.description,
              difficulty: task.difficulty,
            },
          });
          let resources = discovered.resources;
          if (value(learningContext.mode) === 'quick') {
            const free = resources.filter((resource) =>
              ['free', 'mixed'].includes(resource.accessType),
            );
            resources =
              free.length > 0
                ? free
                : resources.filter((resource) => resource.accessType !== 'paid');
          }
          if (resources.length === 0)
            return { attached: 0, partial: discovered.diagnostics.partial };

          const ranked = await ranking.rank({
            learningContext: rankingContext,
            task: {
              title: task.title,
              description: task.description,
              difficulty: task.difficulty,
              estimatedMinutes: task.estimatedMinutes,
              type: task.type,
            },
            resources,
          });
          if (ranked.candidates.length === 0) return { attached: 0, partial: true };

          const assignmentResult = assignment.assign({
            learningContext: rankingContext,
            roadmap: singleTaskRoadmap(enriched, task),
            rankedCandidatesByTask: [{ taskKey: task.key, candidates: ranked.candidates }],
          });
          const links = selectedLinks(assignmentResult.assignments[0], ranked.candidates);
          const candidatesById = new Map(
            ranked.candidates.map((candidate) => [candidate.resource.resourceId, candidate]),
          );
          task.resources = links;
          task.attachments = links.map((link) =>
            attachment(candidatesById.get(link.resourceId), link, timestamp),
          );
          return { attached: links.length, partial: discovered.diagnostics.partial };
        } catch (error) {
          log.warn(
            { taskKey: task.key, errorCode: error?.code ?? 'RESOURCE_ENRICHMENT_FAILED' },
            'Roadmap task resource enrichment degraded',
          );
          return { attached: 0, partial: true };
        }
      });

      return {
        roadmap: enriched,
        diagnostics: {
          taskCount: tasks.length,
          enrichedTaskCount: results.filter((result) => result.attached > 0).length,
          attachmentCount: results.reduce((total, result) => total + result.attached, 0),
          partial: results.some((result) => result.partial || result.attached === 0),
        },
      };
    },
  });
}
