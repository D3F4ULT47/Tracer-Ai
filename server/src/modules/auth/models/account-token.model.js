import mongoose from 'mongoose';

const accountTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ['email_verification', 'password_reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true, collection: 'account_tokens' },
);

accountTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accountTokenSchema.index({ userId: 1, type: 1, usedAt: 1 });

export const AccountToken =
  mongoose.models.AccountToken ?? mongoose.model('AccountToken', accountTokenSchema);
