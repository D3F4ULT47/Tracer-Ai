import { AppError } from '../../../shared/app-error.js';
import { validateAiOutput } from '../json.validator.js';

const difficultyRank = Object.freeze({ beginner: 0, intermediate: 1, advanced: 2, expert: 3 });

function unique(values) {
  return [...new Set(values)];
}

function repairSafeInconsistencies(input) {
  const generation = structuredClone(input);
  const repairs = [];
  let weekNumber = 0;

  generation.roadmap.phases.forEach((phase, phaseIndex) => {
    if (phase.order !== phaseIndex + 1) repairs.push(`Repaired order for phase ${phase.key}`);
    phase.order = phaseIndex + 1;
    phase.state = 'NOT_STARTED';
    phase.dependencies = unique(phase.dependencies);
    phase.estimatedWeeks = phase.weeks.length;

    phase.weeks.forEach((week, weekIndex) => {
      weekNumber += 1;
      if (week.order !== weekIndex + 1 || week.weekNumber !== weekNumber) {
        repairs.push(`Repaired order for week ${week.key}`);
      }
      week.order = weekIndex + 1;
      week.weekNumber = weekNumber;
      week.state = 'NOT_STARTED';
      week.dependencies = unique(week.dependencies);

      week.tasks.forEach((task) => {
        task.state = 'NOT_STARTED';
        task.dependencies = unique(task.dependencies);
        task.notes = [];
        task.resources = [];
      });
    });
  });

  if (generation.roadmap.estimatedWeeks !== weekNumber) {
    repairs.push('Repaired total roadmap duration');
    generation.roadmap.estimatedWeeks = weekNumber;
  }

  const taskNodes = new Map(
    generation.dependencyGraph.nodes
      .filter((node) => node.type === 'task' && node.taskKey)
      .map((node) => [node.taskKey, node]),
  );
  for (const phase of generation.roadmap.phases) {
    for (const week of phase.weeks) {
      for (const task of week.tasks) {
        if (!taskNodes.has(task.key)) {
          const node = {
            key: task.key,
            title: task.title,
            type: 'task',
            required: true,
            taskKey: task.key,
          };
          generation.dependencyGraph.nodes.push(node);
          taskNodes.set(task.key, node);
          repairs.push(`Added missing planning node for task ${task.key}`);
        }
      }
    }
  }

  const edges = new Map(
    generation.dependencyGraph.edges.map((edge) => [`${edge.from}:${edge.to}`, edge]),
  );
  for (const phase of generation.roadmap.phases) {
    for (const week of phase.weeks) {
      for (const task of week.tasks) {
        for (const dependency of task.dependencies) {
          const from = taskNodes.get(dependency)?.key;
          const to = taskNodes.get(task.key)?.key;
          if (from && to && !edges.has(`${from}:${to}`)) {
            edges.set(`${from}:${to}`, { from, to, type: 'prerequisite' });
            repairs.push(`Added missing planning edge ${from} -> ${to}`);
          }
        }
      }
    }
  }
  generation.dependencyGraph.edges = [...edges.values()];

  return { generation, repairs };
}

function hasCycle(nodeKeys, edges) {
  const adjacency = new Map([...nodeKeys].map((key) => [key, []]));
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
  const visiting = new Set();
  const visited = new Set();

  function visit(key) {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    if ((adjacency.get(key) ?? []).some(visit)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  }

  return [...nodeKeys].some(visit);
}

function semanticIssues(generation) {
  const { roadmap, dependencyGraph } = generation;
  const issues = [];
  const phaseKeys = new Set();
  const weekKeys = new Set();
  const taskKeys = new Set();
  const taskPositions = new Map();
  const taskTitles = new Set();
  let position = 0;
  let previousPhaseDifficulty = -1;

  roadmap.phases.forEach((phase, phaseIndex) => {
    if (phaseKeys.has(phase.key)) issues.push(`Duplicate phase key: ${phase.key}`);
    for (const dependency of phase.dependencies) {
      if (!phaseKeys.has(dependency))
        issues.push(`Phase dependency is missing or late: ${dependency}`);
    }
    phaseKeys.add(phase.key);

    let phaseDifficulty = 0;
    phase.weeks.forEach((week) => {
      if (weekKeys.has(week.key)) issues.push(`Duplicate week key: ${week.key}`);
      for (const dependency of week.dependencies) {
        if (!weekKeys.has(dependency))
          issues.push(`Week dependency is missing or late: ${dependency}`);
      }
      weekKeys.add(week.key);

      const weeklyMinutes = week.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
      if (weeklyMinutes > roadmap.weeklyCommitmentHours * 60 * 1.1) {
        issues.push(`Week ${week.key} exceeds the learner's weekly commitment`);
      }

      week.tasks.forEach((task) => {
        const normalizedTitle = task.title.trim().toLowerCase();
        if (taskKeys.has(task.key)) issues.push(`Duplicate task key: ${task.key}`);
        if (taskTitles.has(normalizedTitle)) issues.push(`Duplicate task concept: ${task.title}`);
        for (const dependency of task.dependencies) {
          if (!taskPositions.has(dependency)) {
            issues.push(`Task dependency is missing or late: ${dependency} -> ${task.key}`);
          }
        }
        taskKeys.add(task.key);
        taskTitles.add(normalizedTitle);
        taskPositions.set(task.key, position);
        phaseDifficulty = Math.max(phaseDifficulty, difficultyRank[task.difficulty]);
        position += 1;
      });
    });

    if (phaseIndex > 0 && phaseDifficulty < previousPhaseDifficulty) {
      issues.push(`Difficulty regresses in phase ${phase.key}`);
    }
    previousPhaseDifficulty = phaseDifficulty;
  });

  const nodeKeys = new Set();
  const graphTaskKeys = new Set();
  for (const node of dependencyGraph.nodes) {
    if (nodeKeys.has(node.key)) issues.push(`Duplicate planning node: ${node.key}`);
    nodeKeys.add(node.key);
    if (node.type === 'task') {
      if (!node.taskKey || !taskKeys.has(node.taskKey)) {
        issues.push(`Planning node references an unknown task: ${node.key}`);
      } else if (graphTaskKeys.has(node.taskKey)) {
        issues.push(`Task appears more than once in planning graph: ${node.taskKey}`);
      } else {
        graphTaskKeys.add(node.taskKey);
      }
    } else if (node.taskKey !== null) {
      issues.push(`Concept planning node must not reference a task: ${node.key}`);
    }
  }
  for (const taskKey of taskKeys) {
    if (!graphTaskKeys.has(taskKey))
      issues.push(`Task is orphaned from planning graph: ${taskKey}`);
  }
  for (const edge of dependencyGraph.edges) {
    if (!nodeKeys.has(edge.from) || !nodeKeys.has(edge.to)) {
      issues.push(`Planning edge references an unknown node: ${edge.from} -> ${edge.to}`);
    }
    if (edge.from === edge.to) issues.push(`Planning graph contains self dependency: ${edge.from}`);
  }
  if (hasCycle(nodeKeys, dependencyGraph.edges)) issues.push('Planning graph contains a cycle');

  return unique(issues);
}

export function validateAndRepairRoadmapGeneration(input) {
  validateAiOutput('roadmapGeneration', input);
  const { generation, repairs } = repairSafeInconsistencies(input);
  validateAiOutput('roadmapGeneration', generation);
  const issues = semanticIssues(generation);

  if (issues.length > 0) {
    throw new AppError('Generated roadmap failed semantic validation', {
      status: 422,
      code: 'ROADMAP_SEMANTIC_VALIDATION_FAILED',
      details: issues,
    });
  }

  return Object.freeze({
    generation,
    validation: Object.freeze({
      schemaValid: true,
      semanticValid: true,
      issues: Object.freeze(repairs),
    }),
  });
}
