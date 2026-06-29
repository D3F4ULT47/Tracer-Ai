import mongoose from 'mongoose';

const oauthIdentitySchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    subject: { type: String, required: true },
    email: { type: String, required: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    emailVerifiedAt: Date,
    oauthIdentities: { type: [oauthIdentitySchema], default: [] },
    status: { type: String, enum: ['active', 'deletion_scheduled', 'disabled'], default: 'active' },
    deletionScheduledAt: Date,
    schemaVersion: { type: String, default: '1.0.0' },
  },
  { timestamps: true, optimisticConcurrency: true, collection: 'users' },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index(
  { 'oauthIdentities.provider': 1, 'oauthIdentities.subject': 1 },
  { unique: true, sparse: true },
);
userSchema.index({ status: 1, deletionScheduledAt: 1 });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
