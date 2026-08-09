import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/app-error.js';
import { addTaskNode, removeTaskNodes, renameTaskNode } from './roadmap-graph.js';
import { presentSummary, presentWorkspace } from './roadmap-presenter.js';
import {
  allTasks,
  applyGroupState,
  synchronizeDerivedStates,
  tasksForPhase,
} from './roadmap-progress.js';
import { roadmapRepository } from './roadmap.repository.js';
import { normalizeTaskAttachments } from './task-attachment.js';

function missingNode(type) {
  return new AppError(`${type} was not found`, {
    status: 404,
    code: 'ROADMAP_NODE_NOT_FOUND',
  });
}

function findPhase(roadmap, key) {
  const phase = roadmap.phases.find((candidate) => candidate.key === key);
  if (!phase) throw missingNode('Phase');
  return phase;
}

function findWeek(roadmap, key) {
  for (const phase of roadmap.phases) {
    const week = phase.weeks.find((candidate) => candidate.key === key);
    if (week) return { phase, week };
  }
  throw missingNode('Week');
}

function findTask(roadmap, key) {
  for (const phase of roadmap.phases) {
    for (const week of phase.weeks) {
      const task = week.tasks.find((candidate) => candidate.key === key);
      if (task) return { phase, week, task };
    }
  }
  throw missingNode('Task');
}

function nodeAndTasks(roadmap, nodeType, nodeKey) {
  if (nodeType === 'phase') {
    const node = findPhase(roadmap, nodeKey);
    return { node, tasks: tasksForPhase(node) };
  }
  if (nodeType === 'week') {
    const { week: node } = findWeek(roadmap, nodeKey);
    return { node, tasks: [...node.tasks] };
  }
  const { task: node } = findTask(roadmap, nodeKey);
  return { node, tasks: [node] };
}

function requireProtectedConfirmation(tasks, confirmed) {
  if (!confirmed && tasks.some((task) => task.state === 'COMPLETED' || task.state === 'LOCKED')) {
    throw new AppError('Completed or locked content requires confirmation before editing', {
      status: 409,
      code: 'ROADMAP_PROTECTED_EDIT_CONFIRMATION_REQUIRED',
    });
  }
}

function reindex(roadmap) {
  let weekNumber = 0;
  roadmap.phases.forEach((phase, phaseIndex) => {
    phase.order = phaseIndex + 1;
    phase.weeks.forEach((week, weekIndex) => {
      weekNumber += 1;
      week.order = weekIndex + 1;
      week.weekNumber = weekNumber;
    });
    phase.estimatedWeeks = Math.max(1, phase.weeks.length);
  });
  roadmap.estimatedWeeks = Math.max(1, weekNumber);
  synchronizeDerivedStates(roadmap);
}

function insertAfter(collection, value, afterKey) {
  if (!afterKey) {
    collection.push(value);
    return;
  }
  const index = collection.findIndex((candidate) => candidate.key === afterKey);
  if (index < 0) throw missingNode('Insertion target');
  collection.splice(index + 1, 0, value);
}

function newPhase(data) {
  return {
    key: `phase-${randomUUID()}`,
    title: data.title,
    description: data.description || 'Describe the purpose of this phase.',
    objective: data.description || data.title,
    estimatedWeeks: 1,
    order: 1,
    state: 'NOT_STARTED',
    dependencies: [],
    milestones: [],
    projects: [],
    checkpoints: [],
    completionCriteria: ['Complete every task in this phase.'],
    weeks: [],
  };
}

function newWeek(data) {
  return {
    key: `week-${randomUUID()}`,
    title: data.title,
    description: data.description || 'Describe this week of learning.',
    objective: data.description || data.title,
    weekNumber: 1,
    order: 1,
    state: 'NOT_STARTED',
    dependencies: [],
    milestones: [],
    projects: [],
    checkpoints: [],
    completionCriteria: ['Complete every task in this week.'],
    tasks: [],
  };
}

function newTask(data) {
  return {
    key: `task-${randomUUID()}`,
    title: data.title,
    description: data.description || 'Describe the outcome of this task.',
    estimatedMinutes: data.estimatedMinutes ?? 60,
    difficulty: data.difficulty ?? 'beginner',
    dependencies: [],
    completionCriteria: ['Demonstrate the stated task outcome.'],
    type: data.type ?? 'learn',
    state: 'NOT_STARTED',
    notes: [],
    resources: [],
    attachments: [],
  };
}

function changeSummary(action, nodeType, title) {
  return `${action} ${nodeType}${title ? `: ${title}` : ''}`;
}

function taskChangeActivity(task, changes) {
  if (changes.notes !== undefined) {
    const previous = task.notes ?? [];
    if (changes.notes.length > previous.length) {
      return {
        activityType: 'NOTE_ADDED',
        entityType: 'task',
        entityId: task.key,
        shortDescription: `Added a note to ${task.title}.`,
      };
    }
    if (changes.notes.length < previous.length) {
      return {
        activityType: 'NOTE_DELETED',
        entityType: 'task',
        entityId: task.key,
        shortDescription: `Deleted a note from ${task.title}.`,
      };
    }
    return {
      activityType: 'NOTE_UPDATED',
      entityType: 'task',
      entityId: task.key,
      shortDescription: `Updated a note on ${task.title}.`,
    };
  }
  if (changes.attachments !== undefined) {
    const previous = task.attachments ?? [];
    if (changes.attachments.length > previous.length) {
      return {
        activityType: 'RESOURCE_ATTACHED',
        entityType: 'task',
        entityId: task.key,
        shortDescription: `Attached a resource to ${task.title}.`,
      };
    }
    if (changes.attachments.length < previous.length) {
      return {
        activityType: 'RESOURCE_REMOVED',
        entityType: 'task',
        entityId: task.key,
        shortDescription: `Removed a resource from ${task.title}.`,
      };
    }
    return {
      activityType: 'RESOURCE_REPLACED',
      entityType: 'task',
      entityId: task.key,
      shortDescription: `Replaced a resource on ${task.title}.`,
    };
  }
  if (changes.state === 'COMPLETED' && task.state !== 'COMPLETED') {
    return {
      activityType: 'TASK_COMPLETED',
      entityType: 'task',
      entityId: task.key,
      shortDescription: `Completed ${task.title}.`,
    };
  }
  if (changes.title !== undefined && changes.title !== task.title) {
    return {
      activityType: 'TASK_RENAMED',
      entityType: 'task',
      entityId: task.key,
      shortDescription: `Renamed ${task.title} to ${changes.title}.`,
    };
  }
  return {
    activityType: 'ROADMAP_UPDATED',
    entityType: 'task',
    entityId: task.key,
    shortDescription: `Updated ${task.title}.`,
  };
}

export function createRoadmapService({ repository = roadmapRepository } = {}) {
  return Object.freeze({
    async list(ownerId) {
      return (await repository.list(ownerId)).map(presentSummary);
    },

    async get(ownerId, roadmapId) {
      const result = await repository.get(ownerId, roadmapId, { touch: true });
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },

    async adoptAnonymous({ ownerId, roadmapId, anonymousSessionId }) {
      const result = await repository.adoptAnonymous({ ownerId, roadmapId, anonymousSessionId });
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },

    async update({ ownerId, roadmapId, revision, changes, confirmedProtectedEdit }) {
      const result = await repository.mutate({
        ownerId,
        roadmapId,
        revision,
        changeSummary: 'Updated roadmap details',
        apply({ roadmap }) {
          requireProtectedConfirmation(allTasks(roadmap), confirmedProtectedEdit);
          Object.assign(roadmap, changes);
          return {
            activityType: 'ROADMAP_UPDATED',
            shortDescription: `Updated ${roadmap.title}.`,
          };
        },
      });
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },

    async createNode({
      ownerId,
      roadmapId,
      revision,
      nodeType,
      parentKey,
      afterKey,
      data,
      confirmedProtectedEdit,
    }) {
      const result = await repository.mutate({
        ownerId,
        roadmapId,
        revision,
        changeSummary: changeSummary('Added', nodeType, data.title),
        apply({ roadmap, planningGraph }) {
          let activity;
          if (nodeType === 'phase') {
            insertAfter(roadmap.phases, newPhase(data), afterKey);
          } else if (nodeType === 'week') {
            const phase = findPhase(roadmap, parentKey);
            requireProtectedConfirmation(tasksForPhase(phase), confirmedProtectedEdit);
            insertAfter(phase.weeks, newWeek(data), afterKey);
          } else {
            const { week } = findWeek(roadmap, parentKey);
            requireProtectedConfirmation([...week.tasks], confirmedProtectedEdit);
            const task = newTask(data);
            insertAfter(week.tasks, task, afterKey);
            addTaskNode(planningGraph, task);
            activity = {
              activityType: 'TASK_ADDED',
              entityType: 'task',
              entityId: task.key,
              shortDescription: `Added task ${task.title}.`,
            };
          }
          reindex(roadmap);
          return (
            activity ?? {
              activityType: 'ROADMAP_UPDATED',
              entityType: nodeType,
              entityId: parentKey ?? roadmap.roadmapId,
              shortDescription: `Added ${nodeType} ${data.title}.`,
            }
          );
        },
      });
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },

    async updateNode({
      ownerId,
      roadmapId,
      revision,
      nodeType,
      nodeKey,
      changes,
      confirmedProtectedEdit,
    }) {
      const result = await repository.mutate({
        ownerId,
        roadmapId,
        revision,
        changeSummary: changeSummary('Updated', nodeType, changes.title),
        apply({ roadmap, planningGraph }) {
          const { node, tasks } = nodeAndTasks(roadmap, nodeType, nodeKey);
          requireProtectedConfirmation(tasks, confirmedProtectedEdit);
          const activity =
            nodeType === 'task'
              ? taskChangeActivity(node, changes)
              : changes.state === 'COMPLETED' && nodeType === 'phase'
                ? {
                    activityType: 'PHASE_COMPLETED',
                    entityType: 'phase',
                    entityId: node.key,
                    shortDescription: `Completed phase ${node.title}.`,
                  }
                : {
                    activityType: 'ROADMAP_UPDATED',
                    entityType: nodeType,
                    entityId: node.key,
                    shortDescription: `Updated ${nodeType} ${node.title}.`,
                  };
          if (
            nodeType !== 'task' &&
            (changes.notes !== undefined || changes.attachments !== undefined)
          ) {
            throw new AppError('Notes and attachments are supported only on tasks', {
              status: 422,
              code: 'TASK_CONTENT_SCOPE_INVALID',
            });
          }

          if (changes.state !== undefined) {
            if (nodeType === 'task') node.state = changes.state;
            else applyGroupState(tasks, changes.state);
          }
          if (changes.title !== undefined) {
            node.title = changes.title;
            if (nodeType === 'task') renameTaskNode(planningGraph, nodeKey, changes.title);
          }
          if (changes.description !== undefined) {
            node.description = changes.description;
            if (nodeType !== 'task') node.objective = changes.description || node.objective;
          }
          if (nodeType === 'task') {
            if (changes.estimatedMinutes !== undefined) {
              node.estimatedMinutes = changes.estimatedMinutes;
            }
            if (changes.difficulty !== undefined) {
              node.difficulty = changes.difficulty;
            }
            if (changes.notes !== undefined) {
              node.notes = changes.notes.map((note) => ({
                noteId: note.noteId ?? randomUUID(),
                content: note.content,
              }));
            }
            if (changes.attachments !== undefined) {
              node.attachments = normalizeTaskAttachments(changes.attachments, node.attachments);
            }
          }
          reindex(roadmap);
          return activity;
        },
      });
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },

    async deleteNode({ ownerId, roadmapId, revision, nodeType, nodeKey, confirmedProtectedEdit }) {
      const result = await repository.mutate({
        ownerId,
        roadmapId,
        revision,
        changeSummary: changeSummary('Deleted', nodeType),
        apply({ roadmap, planningGraph }) {
          const { node, tasks } = nodeAndTasks(roadmap, nodeType, nodeKey);
          requireProtectedConfirmation(tasks, confirmedProtectedEdit);
          const taskKeys = tasks.map((task) => task.key);
          const title = node.title;

          if (nodeType === 'phase') {
            roadmap.phases = roadmap.phases.filter((phase) => phase.key !== nodeKey);
          } else if (nodeType === 'week') {
            const { phase } = findWeek(roadmap, nodeKey);
            phase.weeks = phase.weeks.filter((week) => week.key !== nodeKey);
          } else {
            const { week } = findTask(roadmap, nodeKey);
            week.tasks = week.tasks.filter((task) => task.key !== nodeKey);
          }

          removeTaskNodes(planningGraph, taskKeys, allTasks(roadmap));
          reindex(roadmap);
          return nodeType === 'task'
            ? {
                activityType: 'TASK_REMOVED',
                entityType: 'task',
                entityId: nodeKey,
                shortDescription: `Removed task ${title}.`,
              }
            : {
                activityType: 'ROADMAP_UPDATED',
                entityType: nodeType,
                entityId: nodeKey,
                shortDescription: `Removed ${nodeType} ${title}.`,
              };
        },
      });
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },

    async duplicate(ownerId, roadmapId) {
      const result = await repository.duplicate(ownerId, roadmapId);
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },

    remove(ownerId, roadmapId) {
      return repository.softDelete(ownerId, roadmapId);
    },

    async setVisibility({ ownerId, roadmapId, revision, visibility }) {
      const result = await repository.setVisibility({ ownerId, roadmapId, revision, visibility });
      return presentWorkspace(
        result.roadmap,
        result.currentVersion,
        result.initialVersion,
        result.context,
      );
    },
  });
}

export const roadmapService = createRoadmapService();
