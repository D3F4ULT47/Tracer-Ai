import mongoose from 'mongoose';

const roadmapVersionSchema = new mongoose.Schema(
  {
    roadmapId: { type: String, required: true, index: true, immutable: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    anonymousSessionId: { type: String, default: null, index: true, immutable: true },
    contextId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    generationId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
    version: { type: Number, required: true, min: 1, immutable: true },
    source: {
      type: String,
      enum: ['initial_generation', 'manual_edit', 'duplicate', 'regeneration', 'restore'],
      required: true,
      immutable: true,
    },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    planningGraphSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    snapshotHash: { type: String, required: true, immutable: true },
    promptVersion: { type: String, required: true, immutable: true },
    model: { type: String, required: true, immutable: true },
    generatedAt: { type: Date, required: true, immutable: true },
    learningContextVersion: { type: Number, required: true, min: 1, immutable: true },
    editorId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
    changeSummary: { type: String, required: true, maxlength: 500, immutable: true },
    schemaVersion: { type: String, default: '2.0.0', immutable: true },
  },
  { timestamps: true, collection: 'roadmap_versions' },
);

roadmapVersionSchema.index({ roadmapId: 1, version: 1 }, { unique: true });

export const RoadmapVersion =
  mongoose.models.RoadmapVersion ?? mongoose.model('RoadmapVersion', roadmapVersionSchema);
