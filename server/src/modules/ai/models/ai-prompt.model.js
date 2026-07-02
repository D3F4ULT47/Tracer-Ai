import mongoose from 'mongoose';

const aiPromptSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, immutable: true },
    version: { type: String, required: true, immutable: true },
    hash: { type: String, required: true, immutable: true },
    sourcePath: { type: String, required: true, immutable: true },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
    schemaVersion: { type: String, default: '1.0.0', immutable: true },
  },
  { timestamps: true, collection: 'ai_prompts' },
);

aiPromptSchema.index({ name: 1, version: 1 }, { unique: true });
aiPromptSchema.index({ hash: 1 }, { unique: true });

export const AiPrompt = mongoose.models.AiPrompt ?? mongoose.model('AiPrompt', aiPromptSchema);
