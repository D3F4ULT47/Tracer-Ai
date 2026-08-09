import { AppError } from '../../../shared/app-error.js';
import { validateAssignmentResult } from '../resource.validator.js';
import { number, strings } from '../ranking/ranking-context.js';
import { ASSIGNMENT_VERSION, MAX_ALTERNATIVES } from './assignment.config.js';
import { validateAssignmentInput } from './assignment.input.js';

const primaryTypes = Object.freeze({
  learn: ['documentation', 'video', 'playlist', 'course', 'reference', 'article'],
  practice: ['playlist', 'course', 'video', 'project', 'repository', 'documentation', 'article'],
  project: ['playlist', 'course', 'video', 'project', 'repository', 'documentation', 'article'],
  assessment: [
    'playlist',
    'course',
    'video',
    'project',
    'repository',
    'documentation',
    'reference',
  ],
  checkpoint: [
    'playlist',
    'course',
    'video',
    'documentation',
    'reference',
    'project',
    'repository',
  ],
});

function tasksIn(roadmap) {
  return roadmap.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.tasks));
}

function orderedUnique(candidates) {
  const seen = new Set();
  return [...candidates]
    .sort(
      (left, right) =>
        left.rank - right.rank || left.resource.resourceId.localeCompare(right.resource.resourceId),
    )
    .filter(({ resource }) => {
      if (seen.has(resource.resourceId)) return false;
      seen.add(resource.resourceId);
      return true;
    });
}

function permitsPaidResources(learningContext) {
  const budget = number(learningContext.budget);
  const constraints = strings(learningContext.constraints).map((value) => value.toLowerCase());
  return budget > 0 || constraints.some((value) => value.includes('paid resource'));
}

function eligibleCandidates(candidates, learningContext) {
  const ordered = orderedUnique(candidates);
  if (permitsPaidResources(learningContext)) return ordered;
  const freeAlternatives = ordered.filter(({ resource }) =>
    ['free', 'mixed'].includes(resource.accessType),
  );
  return freeAlternatives.length > 0
    ? ordered.filter(({ resource }) => resource.accessType !== 'paid')
    : ordered;
}

function takeFirst(candidates, used, acceptedTypes = null, predicate = null) {
  const selected = candidates.find(
    (candidate) =>
      !used.has(candidate.resource.resourceId) &&
      (!acceptedTypes || acceptedTypes.includes(candidate.resource.type)) &&
      (!predicate || predicate(candidate)),
  );
  if (selected) used.add(selected.resource.resourceId);
  return selected ?? null;
}

function link(candidate, purpose) {
  return {
    resourceId: candidate.resource.resourceId,
    purpose,
    sourceRank: candidate.rank,
    rankingVersion: candidate.rankingVersion,
  };
}

function checkpointFor(task) {
  const configurations = {
    learn: ['knowledge_check', `Explain ${task.title} and apply it without following a tutorial.`],
    practice: [
      'mini_deliverable',
      `Produce a small working example that demonstrates ${task.title}.`,
    ],
    project: ['project_milestone', `Complete and review the ${task.title} milestone.`],
    assessment: [
      'reflection_prompt',
      `Identify what you can now do confidently after ${task.title}.`,
    ],
    checkpoint: ['knowledge_check', `Demonstrate the completion criteria for ${task.title}.`],
  };
  const [type, prompt] = configurations[task.type];
  return { type, prompt };
}

function miniProjectFor(task, hasProjectResource) {
  if (!hasProjectResource && !['practice', 'project'].includes(task.type)) return null;
  return {
    title: `${task.title} application`,
    deliverable: task.completionCriteria[0],
  };
}

function alternativeLimit(learningContext) {
  const weeklyHours = number(learningContext.weeklyHours);
  return weeklyHours !== null && weeklyHours <= 5 ? 1 : MAX_ALTERNATIVES;
}

function assignTask(task, candidates, learningContext) {
  const eligible = eligibleCandidates(candidates, learningContext);
  if (eligible.length === 0) {
    throw new AppError(`No ranked resource candidate is available for task ${task.key}`, {
      status: 422,
      code: 'RESOURCE_ASSIGNMENT_PRIMARY_REQUIRED',
      details: { taskKey: task.key },
    });
  }

  const used = new Set();
  const primary = takeFirst(eligible, used, primaryTypes[task.type]) ?? takeFirst(eligible, used);
  const practice = takeFirst(eligible, used, ['project', 'repository']);
  const reference = takeFirst(eligible, used, ['documentation', 'reference']);
  const project = ['practice', 'project'].includes(task.type)
    ? takeFirst(eligible, used, ['project', 'repository'])
    : null;

  const alternatives = [];
  const limit = alternativeLimit(learningContext);
  while (alternatives.length < limit) {
    const alternative = takeFirst(
      eligible,
      used,
      null,
      ({ resource }) =>
        resource.type !== primary.resource.type || resource.provider !== primary.resource.provider,
    );
    if (!alternative) break;
    alternatives.push(alternative);
  }

  const resourceLinks = [
    link(primary, 'primary'),
    ...alternatives.map((candidate) => link(candidate, 'alternative')),
    ...(practice ? [link(practice, 'practice')] : []),
    ...(reference ? [link(reference, 'reference')] : []),
    ...(project ? [link(project, 'project')] : []),
  ];

  return {
    taskKey: task.key,
    learningObjective: task.description,
    estimatedCompletionMinutes: task.estimatedMinutes,
    completionCriteria: [...task.completionCriteria],
    resourceLinks,
    checkpoint: checkpointFor(task),
    miniProject: miniProjectFor(task, Boolean(project)),
    assignmentVersion: ASSIGNMENT_VERSION,
  };
}

function applyAssignments(roadmap, assignments) {
  const enriched = structuredClone(roadmap);
  const byTask = new Map(assignments.map((assignment) => [assignment.taskKey, assignment]));
  for (const task of tasksIn(enriched)) {
    const learningExperience = byTask.get(task.key);
    task.resources = learningExperience.resourceLinks.map((resourceLink) => ({ ...resourceLink }));
    task.learningExperience = structuredClone(learningExperience);
  }
  return enriched;
}

export function createLearningExperienceService({ now = () => new Date() } = {}) {
  function assign(input) {
    const validated = validateAssignmentInput(input);
    const candidatesByTask = new Map(
      validated.rankedCandidatesByTask.map(({ taskKey, candidates }) => [taskKey, candidates]),
    );
    const assignments = tasksIn(validated.roadmap).map((task) =>
      assignTask(task, candidatesByTask.get(task.key), validated.learningContext),
    );
    return validateAssignmentResult({
      assignments,
      assignmentVersion: ASSIGNMENT_VERSION,
      generatedAt: now().toISOString(),
    });
  }

  return Object.freeze({
    assign,
    enrich(input) {
      const assignmentResult = assign(input);
      return {
        assignmentResult,
        roadmap: applyAssignments(input.roadmap, assignmentResult.assignments),
      };
    },
  });
}

export const learningExperienceService = createLearningExperienceService();
