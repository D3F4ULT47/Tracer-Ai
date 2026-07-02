import resourceBase from './resource-base.schema.json' with { type: 'json' };
import resourceCandidate from './resource-candidate.schema.json' with { type: 'json' };
import resource from './resource.schema.json' with { type: 'json' };
import rankedCandidate from './ranked-candidate.schema.json' with { type: 'json' };
import rankingResult from './ranking-result.schema.json' with { type: 'json' };
import learningExperience from './learning-experience.schema.json' with { type: 'json' };
import assignmentResult from './assignment-result.schema.json' with { type: 'json' };

export const RESOURCE_SCHEMA_VERSION = '1.0.0';

export const resourceSchemas = Object.freeze({
  resourceBase,
  resourceCandidate,
  resource,
  rankedCandidate,
  rankingResult,
  learningExperience,
  assignmentResult,
});

export function getResourceSchema(name) {
  const schema = resourceSchemas[name];
  if (!schema) throw new Error(`Unknown resource schema: ${name}`);
  return schema;
}
