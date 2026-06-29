import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, maxlength: 150 },
    currentVersionId: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      enum: ['metadata_only', 'active', 'archived'],
      default: 'metadata_only',
    },
    schemaVersion: { type: String, default: '1.0.0' },
  },
  { timestamps: true, optimisticConcurrency: true, collection: 'resumes' },
);

export const Resume = mongoose.models.Resume ?? mongoose.model('Resume', resumeSchema);
