import mongoose from 'mongoose';

const roadmapContextSchema = new mongoose.Schema(
  {
    roadmapId: { type: String, required: true, unique: true, immutable: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, immutable: true },
    contextVersion: { type: Number, required: true, min: 1, immutable: true },
    contextHash: { type: String, required: true, immutable: true },
    learningContext: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    sourceUnderstanding: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    sourceAttributions: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
    schemaVersion: { type: String, default: '2.0.0', immutable: true },
  },
  { timestamps: true, collection: 'roadmap_contexts' },
);

export const RoadmapContext =
  mongoose.models.RoadmapContext ?? mongoose.model('RoadmapContext', roadmapContextSchema);
