import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESOURCE_SCHEMA_VERSION,
  getResourceSchema,
  resourceSchemas,
} from '../src/schemas/resources/index.js';

test('resource discovery schemas are versioned and exported', () => {
  assert.equal(RESOURCE_SCHEMA_VERSION, '1.0.0');
  assert.equal(getResourceSchema('resourceCandidate'), resourceSchemas.resourceCandidate);
  assert.equal(getResourceSchema('resource'), resourceSchemas.resource);
  assert.equal(getResourceSchema('rankedCandidate'), resourceSchemas.rankedCandidate);
  assert.equal(getResourceSchema('rankingResult'), resourceSchemas.rankingResult);
  assert.equal(getResourceSchema('learningExperience'), resourceSchemas.learningExperience);
  assert.equal(getResourceSchema('assignmentResult'), resourceSchemas.assignmentResult);
  assert.match(resourceSchemas.resource.$id, /\/resource\/1\.0\.0$/);
  assert.throws(() => getResourceSchema('unknown'), /Unknown resource schema/);
});
