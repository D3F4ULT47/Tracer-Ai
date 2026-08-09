import { allTasks, progressForTasks, tasksForPhase } from './roadmap-progress.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function toPlainJson(value, fallback) {
  const target = value === undefined ? fallback : value;
  if (target === undefined) return undefined;
  if (target === null) return null;
  const plain =
    target && typeof target.toObject === 'function'
      ? target.toObject({ depopulate: true, flattenMaps: true, virtuals: false })
      : target;
  return JSON.parse(JSON.stringify(plain));
}

function asArray(value) {
  const plain = toPlainJson(value, []);
  return Array.isArray(plain) ? plain : [];
}

function asObject(value) {
  const plain = toPlainJson(value, {});
  return plain && typeof plain === 'object' && !Array.isArray(plain) ? plain : {};
}

function titleCase(value) {
  if (!value) return '';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function roadmapLabel(title) {
  const cleaned = String(title ?? '')
    .replace(/^\s*become\s+(?:a|an|the)\s+/i, '')
    .replace(/^\s*becoming\s+(?:a|an|the)\s+/i, '')
    .replace(/\s+roadmap\s*$/i, '')
    .trim();
  return cleaned || title;
}

function summaryLine(summary) {
  const normalized = String(summary ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  const sentenceEnd = normalized.search(/[.!?](?:\s|$)/);
  const firstSentence = sentenceEnd >= 0 ? normalized.slice(0, sentenceEnd + 1).trim() : normalized;
  return firstSentence.length > 150 ? `${firstSentence.slice(0, 147).trim()}…` : firstSentence;
}

function taskDateKey(task) {
  const timestamp = task.updatedAt ?? task.createdAt;
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function dateKeyForOffset(offset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function learningVelocity(tasks) {
  const today = dateKeyForOffset(0);
  return tasks
    .filter((task) => task.state === 'COMPLETED' && taskDateKey(task) === today)
    .reduce((sum, task) => sum + task.estimatedMinutes, 0);
}

function currentStreak(tasks) {
  const completedDays = new Set(
    tasks
      .filter((task) => task.state === 'COMPLETED')
      .map(taskDateKey)
      .filter(Boolean),
  );
  let streak = 0;
  while (completedDays.has(dateKeyForOffset(streak))) streak += 1;
  return streak;
}

function nextMilestoneDetails(currentPhase, currentWeek) {
  if (!currentPhase) return { title: 'Roadmap complete', remainingMinutes: 0 };
  const title =
    currentWeek?.milestones?.[0] ??
    currentPhase.milestones?.[0] ??
    currentWeek?.tasks?.find((task) => task.state !== 'COMPLETED')?.title ??
    currentPhase.title;
  const scopeTasks = currentWeek?.tasks?.length ? currentWeek.tasks : tasksForPhase(currentPhase);
  const remainingMinutes = scopeTasks
    .filter((task) => task.state !== 'COMPLETED')
    .reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return { title, remainingMinutes };
}

function resourceStatus(task) {
  const attachments = task.attachments ?? [];
  if (attachments.length > 0) {
    return {
      state: 'available',
      message: 'Recommended learning resource attached.',
    };
  }
  if ((task.resources ?? []).length > 0) {
    return {
      state: 'temporarily_unavailable',
      message: 'Resource temporarily unavailable.',
    };
  }
  return {
    state: 'not_found',
    message: 'No suitable learning resource found.',
  };
}

function presentTask(task) {
  return {
    key: task.key,
    title: task.title,
    description: task.description,
    estimatedMinutes: task.estimatedMinutes,
    difficulty: task.difficulty,
    dependencies: asArray(task.dependencies),
    completionCriteria: asArray(task.completionCriteria),
    type: task.type,
    state: task.state,
    resourceStatus: resourceStatus(task),
    notes: asArray(task.notes).map((note) => ({
      noteId: note.noteId,
      content: note.content,
      createdAt: iso(note.createdAt),
      updatedAt: iso(note.updatedAt),
    })),
    attachments: asArray(task.attachments).map((attachment) => ({
      attachmentId: attachment.attachmentId,
      type: attachment.type,
      url: attachment.url,
      title: attachment.title,
      description: attachment.description ?? null,
      metadata: asObject(attachment.metadata),
      createdAt: iso(attachment.createdAt),
      updatedAt: iso(attachment.updatedAt),
    })),
  };
}

function presentWeek(week) {
  const tasks = asArray(week.tasks);
  const progress = progressForTasks(tasks);
  return {
    key: week.key,
    title: week.title,
    description: week.description,
    objective: week.objective,
    weekNumber: week.weekNumber,
    order: week.order,
    state: progress.state,
    milestones: asArray(week.milestones),
    projects: asArray(week.projects),
    checkpoints: asArray(week.checkpoints),
    completionCriteria: asArray(week.completionCriteria),
    progress,
    tasks: tasks.map(presentTask),
  };
}

function presentPhase(phase) {
  const weeks = asArray(phase.weeks);
  const progress = progressForTasks(tasksForPhase({ ...phase, weeks }));
  return {
    key: phase.key,
    title: phase.title,
    description: phase.description,
    objective: phase.objective,
    estimatedWeeks: phase.estimatedWeeks,
    order: phase.order,
    state: progress.state,
    milestones: asArray(phase.milestones),
    projects: asArray(phase.projects),
    checkpoints: asArray(phase.checkpoints),
    completionCriteria: asArray(phase.completionCriteria),
    progress,
    weeks: weeks.map(presentWeek),
  };
}

function estimatedCompletionDate(roadmap, progress) {
  const remainingMinutes = progress.totalMinutes - progress.completedMinutes;
  if (remainingMinutes <= 0 || roadmap.weeklyCommitmentHours <= 0) return null;
  const weeks = remainingMinutes / (roadmap.weeklyCommitmentHours * 60);
  return new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
}

function value(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : field;
}

function roadmapMetadata(roadmap, currentVersion, initialVersion, context) {
  const learningContext = context?.learningContext ?? {};
  const targetRole = value(learningContext.careerGoal) ?? value(learningContext.careerDirection);
  return {
    estimatedDuration: {
      weeks: roadmap.estimatedWeeks,
      hours:
        Math.round(
          (allTasks(roadmap).reduce((sum, task) => sum + task.estimatedMinutes, 0) / 60) * 10,
        ) / 10,
    },
    difficulty: roadmap.difficulty,
    generationDate: iso(initialVersion.generatedAt),
    version: currentVersion.version,
    sourceTypes: [
      ...new Set(asArray(context?.sourceAttributions).map((source) => source.sourceType)),
    ],
    targetRole: typeof targetRole === 'string' && targetRole.trim() ? targetRole : null,
  };
}

function presentSourceAttributions(context) {
  return asArray(context?.sourceAttributions).map((source) => ({
    sourceId: source.sourceId,
    sourceType: source.sourceType,
    identifier: source.identifier,
    title: source.title ?? null,
    url: source.url ?? null,
    creator: source.creator ?? null,
    capturedAt: iso(source.capturedAt),
    relevantLocations: asArray(source.relevantLocations).map((location) => ({
      kind: location.kind,
      value: location.value,
    })),
  }));
}

export function presentWorkspace(roadmap, currentVersion, initialVersion, context = null) {
  const tasks = allTasks(roadmap);
  const progress = progressForTasks(tasks);
  const label = roadmapLabel(roadmap.title);
  const currentPhase = roadmap.phases.find(
    (phase) => progressForTasks(tasksForPhase(phase)).state !== 'COMPLETED',
  );
  const currentWeek = currentPhase?.weeks.find(
    (week) => progressForTasks(week.tasks).state !== 'COMPLETED',
  );
  const nextMilestone = nextMilestoneDetails(currentPhase, currentWeek);

  return {
    roadmapId: roadmap.roadmapId,
    title: roadmap.title,
    roadmapLabel: label,
    roadmapIdentifier: `${label} • ${titleCase(roadmap.difficulty)}`,
    description: roadmap.description,
    summary: roadmap.summary,
    summaryLine: summaryLine(roadmap.summary),
    type: roadmap.type,
    difficulty: roadmap.difficulty,
    visibility: roadmap.visibility ?? 'PRIVATE',
    publishedAt: iso(roadmap.publishedAt),
    weeklyCommitmentHours: roadmap.weeklyCommitmentHours,
    currentVersion: roadmap.currentVersion,
    revision: roadmap.revision ?? 0,
    createdAt: iso(roadmap.createdAt),
    updatedAt: iso(roadmap.updatedAt),
    lastOpenedAt: iso(roadmap.lastOpenedAt),
    generationTimestamp: iso(initialVersion.generatedAt),
    learningContextVersion: currentVersion.learningContextVersion,
    progress,
    currentPhase: currentPhase?.title ?? null,
    nextMilestone: nextMilestone.title,
    dashboard: {
      progressMade: {
        percentage: progress.percentage,
        completedTasks: progress.completedTasks,
        totalTasks: progress.totalTasks,
      },
      learningVelocity: {
        minutesToday: learningVelocity(tasks),
      },
      currentStreak: {
        days: currentStreak(tasks),
      },
      nextMilestone,
    },
    estimatedCompletionDate: estimatedCompletionDate(roadmap, progress),
    metadata: roadmapMetadata(roadmap, currentVersion, initialVersion, context),
    sourceAttributions: presentSourceAttributions(context),
    phases: roadmap.phases.map(presentPhase),
  };
}

export function presentSummary(roadmap) {
  return {
    roadmapId: roadmap.roadmapId,
    title: roadmap.title,
    type: roadmap.type,
    difficulty: roadmap.difficulty,
    visibility: roadmap.visibility ?? 'PRIVATE',
    publishedAt: iso(roadmap.publishedAt),
    progress: progressForTasks(allTasks(roadmap)),
    currentVersion: roadmap.currentVersion,
    createdAt: iso(roadmap.createdAt),
    updatedAt: iso(roadmap.updatedAt),
    lastOpenedAt: iso(roadmap.lastOpenedAt),
  };
}
