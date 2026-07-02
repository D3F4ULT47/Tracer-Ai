import { resourceSchemas } from '@tracer-ai/shared/schemas/resources';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { AppError } from '../../shared/app-error.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of Object.values(resourceSchemas)) ajv.addSchema(schema);

const validateCandidate = ajv.getSchema(resourceSchemas.resourceCandidate.$id);
const validateRanking = ajv.getSchema(resourceSchemas.rankingResult.$id);
const validateAssignment = ajv.getSchema(resourceSchemas.assignmentResult.$id);

export function validateResourceCandidate(candidate) {
  if (!validateCandidate(candidate)) {
    throw new AppError('Resource provider returned an invalid candidate', {
      status: 422,
      code: 'RESOURCE_CANDIDATE_INVALID',
      details: validateCandidate.errors.map(({ instancePath, keyword, message }) => ({
        path: instancePath || '/',
        keyword,
        message,
      })),
    });
  }
  return candidate;
}

export function validateRankingResult(result) {
  if (!validateRanking(result)) {
    throw new AppError('Resource ranking output failed schema validation', {
      status: 422,
      code: 'RESOURCE_RANKING_SCHEMA_INVALID',
      details: validateRanking.errors.map(({ instancePath, keyword, message }) => ({
        path: instancePath || '/',
        keyword,
        message,
      })),
    });
  }
  return result;
}

export function validateAssignmentResult(result) {
  if (!validateAssignment(result)) {
    throw new AppError('Learning experience assignment failed schema validation', {
      status: 422,
      code: 'RESOURCE_ASSIGNMENT_SCHEMA_INVALID',
      details: validateAssignment.errors.map(({ instancePath, keyword, message }) => ({
        path: instancePath || '/',
        keyword,
        message,
      })),
    });
  }
  return result;
}
