import mongoose from 'mongoose';

const outboxEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    name: { type: String, required: true, index: true },
    aggregateId: { type: String, required: true },
    aggregateType: { type: String, required: true },
    schemaVersion: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    correlationId: String,
    causationId: String,
    occurredAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'processed', 'failed'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    processedAt: Date,
    lastError: String,
  },
  { timestamps: true, collection: 'outbox_events' },
);

outboxEventSchema.index({ status: 1, nextAttemptAt: 1 });

export const OutboxEvent =
  mongoose.models.OutboxEvent ?? mongoose.model('OutboxEvent', outboxEventSchema);
