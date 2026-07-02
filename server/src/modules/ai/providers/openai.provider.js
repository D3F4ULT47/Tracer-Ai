import OpenAI from 'openai';
import { AppError } from '../../../shared/app-error.js';
import { defineAiProvider } from './ai-provider.js';

function findRefusal(response) {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'refusal') return content.refusal;
    }
  }

  return null;
}

function normalizeUsage(usage = {}) {
  return Object.freeze({
    inputTokens: usage.input_tokens ?? 0,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  });
}

function toProviderSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toProviderSchema);
  if (!schema || typeof schema !== 'object') return schema;

  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== '$schema' && key !== '$id')
      .map(([key, value]) => [key, toProviderSchema(value)]),
  );
}

export function createOpenAiProvider({ apiKey, timeout, client } = {}) {
  const openai = client ?? new OpenAI({ apiKey, timeout, maxRetries: 0 });

  return defineAiProvider({
    name: 'openai',

    async generateStructured({
      model,
      instructions,
      input,
      schema,
      schemaName,
      schemaDescription,
      maxOutputTokens,
      metadata,
    }) {
      const startedAt = Date.now();
      const response = await openai.responses.create({
        model,
        instructions,
        input,
        store: false,
        ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
        ...(metadata ? { metadata } : {}),
        text: {
          format: {
            type: 'json_schema',
            name: schemaName,
            schema: toProviderSchema(schema),
            strict: true,
            ...(schemaDescription ? { description: schemaDescription } : {}),
          },
        },
      });

      const refusal = findRefusal(response);
      if (refusal) {
        throw new AppError('The AI provider declined this request', {
          status: 422,
          code: 'AI_REFUSAL',
        });
      }

      if (!response.output_text) {
        throw new AppError('The AI provider returned no structured output', {
          status: 502,
          code: 'AI_EMPTY_RESPONSE',
        });
      }

      let data;
      try {
        data = JSON.parse(response.output_text);
      } catch {
        throw new AppError('The AI provider returned invalid JSON', {
          status: 502,
          code: 'AI_INVALID_JSON',
        });
      }

      return Object.freeze({
        data,
        provider: 'openai',
        model: response.model ?? model,
        providerRequestId: response.id,
        latencyMs: Date.now() - startedAt,
        usage: normalizeUsage(response.usage),
      });
    },
  });
}
