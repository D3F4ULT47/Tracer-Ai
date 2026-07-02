import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const promptsRoot = fileURLToPath(new URL('../../../../prompts/', import.meta.url));
const safeNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semanticVersionPattern = /^\d+\.\d+\.\d+$/;
const cache = new Map();

export async function loadPrompt(name, version) {
  if (!safeNamePattern.test(name) || !semanticVersionPattern.test(version)) {
    throw new Error('Prompt name or version is invalid');
  }

  const cacheKey = `${name}@${version}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const content = await readFile(`${promptsRoot}${name}/${version}.md`, 'utf8');
  const prompt = Object.freeze({
    name,
    version,
    content,
    hash: createHash('sha256').update(content).digest('hex'),
  });

  cache.set(cacheKey, prompt);
  return prompt;
}
