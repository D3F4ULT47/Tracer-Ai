import mongoose from 'mongoose';

const aiIdempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, immutable: true },
    scope: { type: String, required: true, immutable: true },
    endpoint: { type: String, required: true, immutable: true },
    fingerprint: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    responseStatus: { type: Number, default: null },
    responseBody: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'ai_idempotency_keys' },
);

aiIdempotencyKeySchema.index({ scope: 1, endpoint: 1, key: 1 }, { unique: true });
aiIdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiIdempotencyKey =
  mongoose.models.AiIdempotencyKey ?? mongoose.model('AiIdempotencyKey', aiIdempotencyKeySchema);
