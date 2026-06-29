import mongoose from 'mongoose';

const inferenceSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    aiConfidence: { type: Number, min: 0, max: 1, required: true },
    aiSource: { type: String, required: true, maxlength: 200 },
    updatedAt: { type: Date, required: true },
    lastOptimizedAt: Date,
  },
  { _id: false },
);

const learningProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    preferredLanguage: String,
    preferredPlatforms: { type: [String], default: [] },
    preferredCreators: { type: [String], default: [] },
    preferredResourceTypes: { type: [String], default: [] },
    learningPace: { type: String, enum: ['slow', 'balanced', 'fast'], default: 'balanced' },
    learningStyle: String,
    preferredRoadmapStyle: String,
    weeklyHours: Number,
    budget: Number,
    averageCompletionRate: { type: Number, min: 0, max: 1 },
    inferences: { type: [inferenceSchema], default: [] },
    schemaVersion: { type: String, default: '1.0.0' },
  },
  { timestamps: true, optimisticConcurrency: true, collection: 'learning_profiles' },
);

export const LearningProfile =
  mongoose.models.LearningProfile ?? mongoose.model('LearningProfile', learningProfileSchema);
