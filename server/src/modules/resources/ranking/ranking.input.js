import { z } from 'zod';
import { AppError } from '../../../shared/app-error.js';

const resourceSchema = z
  .object({
    resourceId: z.uuid(),
    provider: z.string().min(1).max(100),
    providerResourceId: z.string().min(1).max(500),
    type: z.enum([
      'video',
      'playlist',
      'repository',
      'documentation',
      'course',
      'project',
      'reference',
      'article',
    ]),
    canonicalUrl: z.url(),
    canonicalUrlHash: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().min(1).max(500),
    description: z.string().nullable().default(null),
    author: z.string().nullable().default(null),
    language: z.string().nullable().default(null),
    estimatedDurationMinutes: z.number().int().min(0).nullable().default(null),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable().default(null),
    tags: z.array(z.string()).max(50).default([]),
    thumbnailUrl: z.url().nullable().default(null),
    popularity: z.record(z.string(), z.number().nullable()).default({}),
    retrievedAt: z.iso.datetime(),
    providerMetadata: z.record(z.string(), z.unknown()).default({}),
    metadataVersion: z.string().default('1.0.0'),
    availabilityStatus: z.enum(['available', 'unavailable', 'unknown']).default('unknown'),
    accessType: z.enum(['free', 'paid', 'mixed', 'unknown']).default('unknown'),
    authorityScore: z.number().min(0).max(100).nullable().default(null),
    freshnessScore: z.number().min(0).max(100).nullable().default(null),
    popularityScore: z.number().min(0).max(100).nullable().default(null),
    completenessScore: z.number().min(0).max(100).nullable().default(null),
    providerConfidenceScore: z.number().min(0).max(100).nullable().default(null),
    qualityScore: z.number().min(0).max(100).nullable().default(null),
    qualityScoringVersion: z.string().nullable().default(null),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const inputSchema = z.object({
  learningContext: z.record(z.string(), z.unknown()),
  task: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5_000).default(''),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    estimatedMinutes: z.number().int().min(1).max(100_000).nullable().default(null),
    type: z.string().max(100).nullable().default(null),
    progressContext: z
      .object({
        completedPhaseTitles: z.array(z.string()).max(100).default([]),
        completedTaskCount: z.number().int().min(0).default(0),
      })
      .default({}),
  }),
  resources: z.array(resourceSchema).max(500),
});

export function validateRankingInput(input) {
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    throw new AppError('Resource ranking input is invalid', {
      status: 422,
      code: 'RESOURCE_RANKING_INPUT_INVALID',
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
