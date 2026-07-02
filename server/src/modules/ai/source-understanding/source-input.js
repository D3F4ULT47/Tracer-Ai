import { z } from 'zod';
import { AppError } from '../../../shared/app-error.js';

const sourceSchema = z
  .object({
    type: z.enum([
      'natural_prompt',
      'resume',
      'pdf',
      'github_repository',
      'youtube_video',
      'google_document',
      'ai_report',
    ]),
    content: z.string().max(300_000).nullable().default(null),
    url: z.url().nullable().default(null),
    title: z.string().trim().max(500).nullable().default(null),
    processingStatus: z.literal('ready').default('ready'),
    metadata: z
      .object({
        fileName: z.string().trim().max(500).nullable().default(null),
        pageCount: z.number().int().min(1).max(2_000).nullable().default(null),
        branch: z.string().trim().max(300).nullable().default(null),
        transcript: z.string().max(300_000).nullable().default(null),
        reportProvider: z.string().trim().max(100).nullable().default(null),
      })
      .default({}),
  })
  .strict();

const inputSchema = z.object({ sources: z.array(sourceSchema).min(1).max(8) }).strict();

export function validateSourceUnderstandingInput(input) {
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    throw new AppError('Roadmap sources are invalid', {
      status: 422,
      code: 'ROADMAP_SOURCES_INVALID',
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  for (const [index, source] of result.data.sources.entries()) {
    const needsUrl = ['github_repository', 'youtube_video', 'google_document'].includes(
      source.type,
    );
    if (needsUrl && !source.url) {
      throw new AppError(`Source ${index + 1} requires a URL`, {
        status: 422,
        code: 'ROADMAP_SOURCE_URL_REQUIRED',
      });
    }
    if (!needsUrl && !source.content?.trim()) {
      throw new AppError(`Source ${index + 1} requires content`, {
        status: 422,
        code: 'ROADMAP_SOURCE_CONTENT_REQUIRED',
      });
    }
  }
  return result.data;
}
