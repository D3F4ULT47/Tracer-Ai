import { createHash } from 'node:crypto';

/**
 * JSON with object keys sorted at every level, so equal values always serialise identically.
 * `undefined` object members are dropped, matching `JSON.stringify`.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const members = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${members.join(',')}}`;
}

export function sha256(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalJson(value))
    .digest('hex');
}

/**
 * Identity of one AI call. Prompt text, schema and model chain are hashed in, so a new prompt
 * version, schema version or model never matches an older result.
 */
export function aiCallFingerprint({
  operation,
  scope,
  dataClass,
  models,
  instructions,
  schema,
  input,
}) {
  return sha256({
    operation,
    scope,
    dataClass,
    models,
    instructions: sha256(instructions ?? ''),
    schema: sha256(schema ?? null),
    input: typeof input === 'string' ? sha256(input) : sha256(input ?? null),
  });
}
