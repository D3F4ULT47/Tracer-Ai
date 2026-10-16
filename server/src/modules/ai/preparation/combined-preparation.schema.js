import { getAiSchema } from '@tracer-ai/shared/schemas/ai';
import {
  ROUTED_SOURCE_PROMPT_VERSION,
  sourceUnderstandingProviderSchema,
} from '../source-understanding/source-understanding.service.js';

function prefixReferences(value, prefix) {
  if (Array.isArray(value)) return value.map((entry) => prefixReferences(entry, prefix));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === '$ref' && typeof entry === 'string'
        ? entry.replace('#/$defs/', `#/$defs/${prefix}`)
        : prefixReferences(entry, prefix),
    ]),
  );
}

function embed(schema, prefix) {
  const { $defs = {}, $schema, $id, ...root } = structuredClone(schema);
  void $schema;
  void $id;
  return {
    root: prefixReferences(root, prefix),
    definitions: Object.fromEntries(
      Object.entries($defs).map(([name, definition]) => [
        `${prefix}${name}`,
        prefixReferences(definition, prefix),
      ]),
    ),
  };
}

/**
 * One strict schema whose halves are the existing source-understanding and learner-assessment
 * provider schemas, so each half is validated by its existing validator.
 */
export function combinedPreparationSchema() {
  const source = embed(sourceUnderstandingProviderSchema(ROUTED_SOURCE_PROMPT_VERSION), 'su_');
  const learner = embed(getAiSchema('learnerAssessment'), 'la_');
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sourceUnderstanding', 'learnerAssessment'],
    properties: {
      sourceUnderstanding: source.root,
      learnerAssessment: learner.root,
    },
    $defs: { ...source.definitions, ...learner.definitions },
  };
}
