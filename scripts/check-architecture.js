import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['client/src', 'server/src', 'shared/src'];
const sourceExtensions = new Set(['.js', '.jsx']);
const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function collectFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? collectFiles(path)
      : sourceExtensions.has(extname(path))
        ? [normalize(path)]
        : [];
  });
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;

  const target = resolve(dirname(fromFile), specifier);
  const candidates = [target, `${target}.js`, `${target}.jsx`, join(target, 'index.js')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function getImports(file) {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(importPattern)]
    .map((match) => resolveLocalImport(file, match[1]))
    .filter(Boolean)
    .map(normalize);
}

const files = sourceRoots.flatMap((directory) => collectFiles(resolve(root, directory)));
const graph = new Map(files.map((file) => [file, getImports(file)]));
const violations = [];

function workspacePath(file) {
  return relative(root, file).split(sep).join('/');
}

for (const [file, imports] of graph) {
  const from = workspacePath(file);

  for (const importedFile of imports) {
    const target = workspacePath(importedFile);

    if (from.startsWith('shared/') && !target.startsWith('shared/')) {
      violations.push(`Shared code cannot import ${target} (${from})`);
    }

    if (from.startsWith('client/') && target.startsWith('server/')) {
      violations.push(`Client code cannot import server code (${from} -> ${target})`);
    }

    if (from.startsWith('server/') && target.startsWith('client/')) {
      violations.push(`Server code cannot import client code (${from} -> ${target})`);
    }

    const fromModule = from.match(/^server\/src\/modules\/([^/]+)\//)?.[1];
    const targetModule = target.match(/^server\/src\/modules\/([^/]+)\//)?.[1];

    if (
      fromModule &&
      targetModule &&
      fromModule !== targetModule &&
      !target.endsWith('/index.js')
    ) {
      violations.push(`Module ${fromModule} imports private code from ${targetModule}: ${target}`);
    }
  }
}

const visiting = new Set();
const visited = new Set();

function findCycles(file, path = []) {
  if (visiting.has(file)) {
    const cycleStart = path.indexOf(file);
    const cycle = [...path.slice(cycleStart), file].map(workspacePath).join(' -> ');
    violations.push(`Circular dependency: ${cycle}`);
    return;
  }

  if (visited.has(file)) return;
  visiting.add(file);

  for (const dependency of graph.get(file) ?? []) {
    if (graph.has(dependency)) findCycles(dependency, [...path, file]);
  }

  visiting.delete(file);
  visited.add(file);
}

for (const file of files) findCycles(file);

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed for ${files.length} source files.`);
}
