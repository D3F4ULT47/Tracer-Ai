import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';

const inputSchema = z.object({
  task: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5_000).default(''),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  }),
  learningContext: z.record(z.string(), z.unknown()).default({}),
});

export function validateDiscoveryInput(input) {
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    throw new AppError('Resource discovery input is invalid', {
      status: 422,
      code: 'RESOURCE_DISCOVERY_INPUT_INVALID',
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

function fieldValue(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : field;
}

export function buildDiscoveryQuery({ task, learningContext }) {
  const technologies = fieldValue(learningContext.technologyStack);
  const preferredLanguage = fieldValue(learningContext.preferredResourceLanguage);
  const technologyTerms = Array.isArray(technologies)
    ? technologies
        .map((technology) =>
          typeof technology === 'string' ? technology : (technology?.name ?? technology?.value),
        )
        .filter(Boolean)
        .slice(0, 5)
    : [];
  return Object.freeze({
    query: [...new Set([task.title, ...technologyTerms])].join(' ').slice(0, 500),
    task: Object.freeze({ ...task }),
    preferredLanguage: typeof preferredLanguage === 'string' ? preferredLanguage : null,
  });
}
