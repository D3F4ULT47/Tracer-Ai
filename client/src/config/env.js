import { z } from 'zod';

const clientEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .refine(
      (value) => value.startsWith('/') || z.url().safeParse(value).success,
      'VITE_API_BASE_URL must be an absolute URL or a root-relative path',
    ),
  VITE_GOOGLE_OAUTH_ENABLED: z.boolean(),
});

const result = clientEnvironmentSchema.safeParse({
  VITE_API_BASE_URL:
    import.meta.env.VITE_API_BASE_URL ??
    (import.meta.env.DEV ? 'http://localhost:4000/api/v1' : '/api/v1'),
  VITE_GOOGLE_OAUTH_ENABLED: import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === 'true',
});

if (!result.success) {
  const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid client environment configuration:\n${issues.join('\n')}`);
}

export const clientEnv = Object.freeze(result.data);
