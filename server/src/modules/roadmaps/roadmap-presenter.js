import { allTasks, progressForTasks, tasksForPhase } from './roadmap-progress.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function presentTask(task) {
  return {
    key: task.key,
    title: task.title,
    description: task.description,
    estimatedMinutes: task.estimatedMinutes,
    difficulty: task.difficulty,
    dependencies: [...task.dependencies],
    completionCriteria: [...task.completionCriteria],
    type: task.type,
    state: task.state,
    notes: task.notes.map((note) => ({
      noteId: note.noteId,
      content: note.content,
      createdAt: iso(note.createdAt),
      updatedAt: iso(note.updatedAt),
    })),
    attachments: (task.attachments ?? []).map((attachment) => ({
      attachmentId: attachment.attachmentId,
      type: attachment.type,
      url: attachment.url,
      title: attachment.title,
      description: attachment.description ?? null,
      metadata: structuredClone(attachment.metadata ?? {}),
      createdAt: iso(attachment.createdAt),
      updatedAt: iso(attachment.updatedAt),
    })),
  };
}

function presentWeek(week) {
  const progress = progressForTasks(week.tasks);
  return {
    key: week.key,
    title: week.title,
    description: week.description,
    objective: week.objective,
    weekNumber: week.weekNumber,
    order: week.order,
    state: progress.state,
    milestones: [...week.milestones],
    projects: [...week.projects],
    checkpoints: [...week.checkpoints],
    completionCriteria: [...week.completionCriteria],
    progress,
    tasks: week.tasks.map(presentTask),
  };
}

function presentPhase(phase) {
  const progress = progressForTasks(tasksForPhase(phase));
  return {
    key: phase.key,
    title: phase.title,
    description: phase.description,
    objective: phase.objective,
    estimatedWeeks: phase.estimatedWeeks,
    order: phase.order,
    state: progress.state,
    milestones: [...phase.milestones],
    projects: [...phase.projects],
    checkpoints: [...phase.checkpoints],
    completionCriteria: [...phase.completionCriteria],
    progress,
    weeks: phase.weeks.map(presentWeek),
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
      ...new Set((context?.sourceAttributions ?? []).map((source) => source.sourceType)),
    ],
    targetRole: typeof targetRole === 'string' && targetRole.trim() ? targetRole : null,
  };
}

export function presentWorkspace(roadmap, currentVersion, initialVersion, context = null) {
  const tasks = allTasks(roadmap);
  const progress = progressForTasks(tasks);
  const currentPhase = roadmap.phases.find(
    (phase) => progressForTasks(tasksForPhase(phase)).state !== 'COMPLETED',
  );
  const currentWeek = currentPhase?.weeks.find(
    (week) => progressForTasks(week.tasks).state !== 'COMPLETED',
  );

  return {
    roadmapId: roadmap.roadmapId,
    title: roadmap.title,
    description: roadmap.description,
    summary: roadmap.summary,
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
    nextMilestone: currentWeek?.milestones[0] ?? currentPhase?.milestones[0] ?? null,
    estimatedCompletionDate: estimatedCompletionDate(roadmap, progress),
    metadata: roadmapMetadata(roadmap, currentVersion, initialVersion, context),
    sourceAttributions: structuredClone(context?.sourceAttributions ?? []),
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
