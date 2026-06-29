import mongoose from 'mongoose';

const resumeVersionSchema = new mongoose.Schema(
  {
    resumeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    source: { type: String, enum: ['manual', 'upload'], default: 'manual' },
    fileReference: String,
    schemaVersion: { type: String, default: '1.0.0' },
  },
  { timestamps: true, collection: 'resume_versions' },
);

resumeVersionSchema.index({ resumeId: 1, version: 1 }, { unique: true });

export const ResumeVersion =
  mongoose.models.ResumeVersion ?? mongoose.model('ResumeVersion', resumeVersionSchema);
