import { randomUUID } from 'node:crypto';
import { ACTIVITY_TYPES } from '@tracer-ai/shared/contracts';
import mongoose from 'mongoose';

const roadmapActivitySchema = new mongoose.Schema(
  {
    activityId: { type: String, default: randomUUID, unique: true, sparse: true, immutable: true },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    roadmapId: { type: String, required: true, index: true, immutable: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    anonymousSessionId: { type: String, default: null, index: true, immutable: true },
    roadmapTitle: { type: String, default: null, maxlength: 300, immutable: true },
    activityType: { type: String, enum: ACTIVITY_TYPES, default: null, immutable: true },
    entityType: {
      type: String,
      enum: ['roadmap', 'phase', 'week', 'task', null],
      default: null,
      immutable: true,
    },
    entityId: { type: String, default: null, maxlength: 500, immutable: true },
    shortDescription: { type: String, default: null, maxlength: 500, immutable: true },
    timestamp: { type: Date, default: Date.now, index: true, immutable: true },
    type: {
      type: String,
      enum: ['roadmap_generated', 'roadmap_edited', 'roadmap_duplicated', 'roadmap_deleted'],
      default: null,
      immutable: true,
    },
    roadmapVersion: { type: Number, required: true, min: 1, immutable: true },
    runId: { type: String, required: true, immutable: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
    schemaVersion: { type: String, default: '1.0.0', immutable: true },
  },
  { timestamps: true, collection: 'roadmap_activities' },
);

roadmapActivitySchema.index({ roadmapId: 1, createdAt: -1 });
roadmapActivitySchema.index({ userId: 1, timestamp: -1, activityId: -1 });

export const RoadmapActivity =
  mongoose.models.RoadmapActivity ?? mongoose.model('RoadmapActivity', roadmapActivitySchema);
