import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const reviewSummarySchema = new mongoose.Schema(
  {
    detectedLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'] },
    estimatedWeeks: { type: Number, min: 1, max: 520 },
    missingSkills: { type: [String], default: [] },
    weeklyCommitmentHours: { type: Number, min: 1, max: 168 },
    confidence: { type: Number, min: 0, max: 1 },
  },
  { _id: false },
);

const aiRunSchema = new mongoose.Schema(
  {
    runId: { type: String, default: randomUUID, unique: true, immutable: true },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    requestId: { type: String, required: true, immutable: true },
    operation: {
      type: String,
      enum: ['learner_assessment', 'source_understanding', 'roadmap_generation'],
      required: true,
      immutable: true,
    },
    inputHash: { type: String, required: true, immutable: true },
    inputType: {
      type: String,
      enum: [
        'natural_language',
        'natural_prompt',
        'project_description',
        'resume',
        'pdf',
        'github_repository',
        'youtube_video',
        'google_document',
        'ai_report',
        'combined',
      ],
      required: true,
      immutable: true,
    },
    mode: {
      type: String,
      enum: ['analysis', 'quick', 'personalized'],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: [
        'processing',
        'awaiting_clarification',
        'awaiting_review',
        'accepted',
        'rejected',
        'completed',
        'failed',
      ],
      default: 'processing',
      index: true,
    },
    clarificationAsked: { type: Boolean, default: false },
    reviewSummary: { type: reviewSummarySchema, default: null },
    acceptedRoadmapId: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    sanitizedError: {
      code: String,
      message: String,
    },
    schemaVersion: { type: String, default: '1.0.0' },
  },
  { timestamps: true, collection: 'ai_runs' },
);

aiRunSchema.index({ ownerId: 1, createdAt: -1 });

export const AiRun = mongoose.models.AiRun ?? mongoose.model('AiRun', aiRunSchema);
