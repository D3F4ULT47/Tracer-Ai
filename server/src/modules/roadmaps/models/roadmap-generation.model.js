import mongoose from 'mongoose';

const validationSchema = new mongoose.Schema(
  {
    schemaValid: { type: Boolean, required: true },
    semanticValid: { type: Boolean, required: true },
    issues: { type: [String], default: [] },
  },
  { _id: false },
);

const roadmapGenerationSchema = new mongoose.Schema(
  {
    roadmapId: { type: String, required: true, index: true, immutable: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    anonymousSessionId: { type: String, default: null, index: true, immutable: true },
    contextId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    runId: { type: String, required: true, unique: true, immutable: true },
    provider: { type: String, required: true, immutable: true },
    model: { type: String, required: true, immutable: true },
    prompt: {
      name: { type: String, required: true },
      version: { type: String, required: true },
      hash: { type: String, required: true },
    },
    outputSchemaVersion: { type: String, required: true, immutable: true },
    generationParameters: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
    validation: { type: validationSchema, required: true, immutable: true },
    planningGraph: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    generationTimeMs: { type: Number, required: true, min: 0, immutable: true },
    createdRoadmapVersion: { type: Number, required: true, min: 1, immutable: true },
    schemaVersion: { type: String, default: '2.0.0', immutable: true },
  },
  { timestamps: true, collection: 'roadmap_generations' },
);

export const RoadmapGeneration =
  mongoose.models.RoadmapGeneration ?? mongoose.model('RoadmapGeneration', roadmapGenerationSchema);
