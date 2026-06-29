import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const featureFlagsSchema = z
  .string()
  .default('{}')
  .transform((value, context) => {
    try {
      return z.record(z.string(), z.boolean()).parse(JSON.parse(value));
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'FEATURE_FLAGS must be a JSON object containing boolean values',
      });
      return z.NEVER;
    }
  });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(4000),
    CLIENT_ORIGIN: z.url().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MONGODB_URI: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1).optional(),
    APP_URL: z.url().optional(),
    JWT_PRIVATE_KEY_BASE64: z.string().optional(),
    JWT_PUBLIC_KEY_BASE64: z.string().optional(),
    JWT_KEY_ID: z.string().default('tracer-ai-local'),
    TOKEN_HASH_SECRET: z.string().min(32).optional(),
    CSRF_SECRET: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.url().optional(),
    OPENAI_API_KEY: z.string().optional(),
    AI_MODEL_FAST: z.string().optional(),
    AI_MODEL_CORE: z.string().optional(),
    AI_MODEL_ESCALATION: z.string().optional(),
    FEATURE_FLAGS: featureFlagsSchema,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return;

    for (const key of [
      'CLIENT_ORIGIN',
      'MONGODB_URI',
      'REDIS_URL',
      'APP_URL',
      'JWT_PRIVATE_KEY_BASE64',
      'JWT_PUBLIC_KEY_BASE64',
      'TOKEN_HASH_SECRET',
      'CSRF_SECRET',
      'RESEND_API_KEY',
      'EMAIL_FROM',
    ]) {
      if (!value[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    CLIENT_ORIGIN: value.CLIENT_ORIGIN ?? 'http://localhost:5173',
    MONGODB_URI: value.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/tracer_ai',
    REDIS_URL: value.REDIS_URL ?? 'redis://127.0.0.1:6379',
    APP_URL: value.APP_URL ?? 'http://localhost:5173',
  }));

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

export const env = Object.freeze(result.data);
