function taskTotals(tasks) {
  return tasks.reduce(
    (totals, task) => {
      totals.totalTasks += 1;
      totals.totalMinutes += task.estimatedMinutes;
      if (task.state === 'COMPLETED') {
        totals.completedTasks += 1;
        totals.completedMinutes += task.estimatedMinutes;
      }
      return totals;
    },
    { completedTasks: 0, totalTasks: 0, completedMinutes: 0, totalMinutes: 0 },
  );
}

function stateFromTasks(tasks) {
  if (tasks.length === 0) return 'NOT_STARTED';
  if (tasks.every((task) => task.state === 'COMPLETED')) return 'COMPLETED';
  if (tasks.every((task) => task.state === 'LOCKED')) return 'LOCKED';
  if (tasks.some((task) => ['COMPLETED', 'IN_PROGRESS'].includes(task.state))) {
    return 'IN_PROGRESS';
  }
  return 'NOT_STARTED';
}

export function progressForTasks(tasks) {
  const totals = taskTotals(tasks);
  return Object.freeze({
    state: stateFromTasks(tasks),
    percentage:
      totals.totalMinutes === 0
        ? 0
        : Number(((totals.completedMinutes / totals.totalMinutes) * 100).toFixed(1)),
    ...totals,
  });
}

export function tasksForPhase(phase) {
  return phase.weeks.flatMap((week) => [...week.tasks]);
}

export function allTasks(roadmap) {
  return roadmap.phases.flatMap(tasksForPhase);
}

export function synchronizeDerivedStates(roadmap) {
  for (const phase of roadmap.phases) {
    for (const week of phase.weeks) week.state = progressForTasks(week.tasks).state;
    phase.state = progressForTasks(tasksForPhase(phase)).state;
  }
}

export function applyGroupState(tasks, state) {
  if (state === 'IN_PROGRESS') {
    const next = tasks.find((task) => task.state !== 'COMPLETED');
    if (next) next.state = 'IN_PROGRESS';
    return;
  }
  for (const task of tasks) task.state = state;
}
