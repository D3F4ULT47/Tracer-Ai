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
    REDIS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    APP_URL: z.url().optional(),
    JWT_PRIVATE_KEY_BASE64: z.string().optional(),
    JWT_PUBLIC_KEY_BASE64: z.string().optional(),
    JWT_KEY_ID: z.string().default('tracer-ai-local'),
    TOKEN_HASH_SECRET: z.string().min(32).optional(),
    CSRF_SECRET: z.string().min(32).optional(),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    DEV_AUTO_VERIFY_EMAIL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.url().optional(),
    YOUTUBE_API_KEY: z.string().min(1).optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
    RESOURCE_DISCOVERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
    RESOURCE_DISCOVERY_MAX_RESULTS_PER_PROVIDER: z.coerce.number().int().min(1).max(50).default(10),
    AICREDITS_API_KEY: z.string().optional(),
    AICREDITS_BASE_URL: z.url().default('https://api.aicredits.in/v1'),
    AI_API_KEY: z.string().optional(),
    AI_BASE_URL: z.url().optional(),
    AI_PROVIDER: z.enum(['aicredits', 'openai']).default('aicredits'),
    AI_MODEL_FAST: z.string().optional(),
    AI_MODEL_CORE: z.string().optional(),
    AI_MODEL_ESCALATION: z.string().optional(),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(120_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    AI_ASSESSMENT_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65),
    AI_ASSESSMENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_000).max(32_000).default(8_000),
    AI_SOURCE_UNDERSTANDING_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(32_000)
      .default(10_000),
    AI_ROADMAP_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(4_000).max(64_000).default(24_000),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_TEMP_FOLDER: z.string().default('tracer-ai/tmp/resumes'),
    RESUME_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(25 * 1_024 * 1_024)
      .default(10 * 1_024 * 1_024),
    RESUME_MAX_PDF_PAGES: z.coerce.number().int().min(1).max(200).default(50),
    RESUME_MAX_EXTRACTED_CHARACTERS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(1_000_000)
      .default(200_000),
    FEATURE_FLAGS: featureFlagsSchema,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.DEV_AUTO_VERIFY_EMAIL) {
      context.addIssue({
        code: 'custom',
        path: ['DEV_AUTO_VERIFY_EMAIL'],
        message: 'DEV_AUTO_VERIFY_EMAIL cannot be enabled in production',
      });
    }

    if (value.COOKIE_SAME_SITE === 'none' && value.COOKIE_SECURE === false) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true when COOKIE_SAME_SITE is none',
      });
    }

    if (value.NODE_ENV !== 'production') return;

    for (const key of [
      'CLIENT_ORIGIN',
      'MONGODB_URI',
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

    if (value.REDIS_ENABLED && !value.REDIS_URL) {
      context.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when REDIS_ENABLED is true',
      });
    }
  })
  .transform((value) => ({
    ...value,
    CLIENT_ORIGIN: value.CLIENT_ORIGIN ?? 'http://localhost:5173',
    MONGODB_URI: value.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/tracer_ai',
    REDIS_URL: value.REDIS_URL ?? 'redis://127.0.0.1:6379',
    AI_API_KEY: value.AI_API_KEY ?? value.AICREDITS_API_KEY,
    AI_BASE_URL: value.AI_BASE_URL ?? value.AICREDITS_BASE_URL,
    APP_URL: value.APP_URL ?? 'http://localhost:5173',
    COOKIE_SECURE: value.COOKIE_SECURE ?? value.NODE_ENV === 'production',
  }));

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

export const env = Object.freeze(result.data);
