import { AppError } from '../../shared/app-error.js';

export function renameTaskNode(graph, taskKey, title) {
  const node = graph.nodes.find((candidate) => candidate.taskKey === taskKey);
  if (node) node.title = title;
}

export function addTaskNode(graph, task) {
  graph.nodes.push({
    key: task.key,
    title: task.title,
    type: 'task',
    required: true,
    taskKey: task.key,
  });
}

export function removeTaskNodes(graph, taskKeys, remainingTasks) {
  const removing = new Set(taskKeys);
  const dependents = remainingTasks.filter((task) =>
    task.dependencies.some((dependency) => removing.has(dependency)),
  );
  if (dependents.length > 0) {
    throw new AppError('This item is required by later tasks', {
      status: 409,
      code: 'ROADMAP_DEPENDENCY_CONFLICT',
      details: dependents.map(({ key, title }) => ({ key, title })),
    });
  }

  const nodeKeys = new Set(
    graph.nodes
      .filter((node) => node.taskKey && removing.has(node.taskKey))
      .map((node) => node.key),
  );
  graph.nodes = graph.nodes.filter((node) => !nodeKeys.has(node.key));
  graph.edges = graph.edges.filter((edge) => !nodeKeys.has(edge.from) && !nodeKeys.has(edge.to));
}
