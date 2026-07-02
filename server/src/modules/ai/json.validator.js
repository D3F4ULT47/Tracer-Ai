import { aiSchemas, getAiSchema } from '@tracer-ai/shared/schemas/ai';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { AppError } from '../../shared/app-error.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

for (const schema of Object.values(aiSchemas)) ajv.addSchema(schema);

const validators = new Map(
  Object.entries(aiSchemas).map(([name, schema]) => [name, ajv.getSchema(schema.$id)]),
);

export function validateAiOutput(schemaName, data) {
  getAiSchema(schemaName);
  const validate = validators.get(schemaName);

  if (!validate(data)) {
    throw new AppError('AI output failed schema validation', {
      status: 422,
      code: 'AI_SCHEMA_VALIDATION_FAILED',
      details: validate.errors.map(({ instancePath, keyword, message }) => ({
        path: instancePath || '/',
        keyword,
        message,
      })),
    });
  }

  return data;
}
