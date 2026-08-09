import mongoose from 'mongoose';

const aiUsageRecordSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true, immutable: true },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    provider: { type: String, required: true, immutable: true },
    model: { type: String, required: true, immutable: true },
    operation: { type: String, required: true, immutable: true },
    promptName: { type: String, required: true, immutable: true },
    promptVersion: { type: String, required: true, immutable: true },
    promptHash: { type: String, required: true, immutable: true },
    outputSchemaVersion: { type: String, required: true, immutable: true },
    inputTokens: { type: Number, default: 0, min: 0, immutable: true },
    cachedInputTokens: { type: Number, default: 0, min: 0, immutable: true },
    outputTokens: { type: Number, default: 0, min: 0, immutable: true },
    reasoningTokens: { type: Number, default: 0, min: 0, immutable: true },
    totalTokens: { type: Number, default: 0, min: 0, immutable: true },
    latencyMs: { type: Number, required: true, min: 0, immutable: true },
    attempt: { type: Number, default: 1, min: 1, immutable: true },
    outcome: {
      type: String,
      enum: ['success', 'refusal', 'provider_error', 'invalid_output'],
      required: true,
      immutable: true,
    },
    providerRequestId: { type: String, default: null, immutable: true },
    calculatedCost: { type: Number, default: null, min: 0, immutable: true },
    costCurrency: { type: String, default: 'USD', immutable: true },
    pricingVersion: { type: String, default: null, immutable: true },
    schemaVersion: { type: String, default: '1.0.0', immutable: true },
  },
  { timestamps: true, collection: 'ai_usage_records' },
);

aiUsageRecordSchema.index({ ownerId: 1, createdAt: -1 });
aiUsageRecordSchema.index({ model: 1, outcome: 1, createdAt: -1 });

export const AiUsageRecord =
  mongoose.models.AiUsageRecord ?? mongoose.model('AiUsageRecord', aiUsageRecordSchema);
