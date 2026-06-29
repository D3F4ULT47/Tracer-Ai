import mongoose from 'mongoose';
import { appendOutboxEvent } from '../infrastructure/events/outbox.service.js';
import { AccountToken } from '../modules/auth/models/account-token.model.js';
import { AuthSession } from '../modules/auth/models/auth-session.model.js';
import { User } from '../modules/auth/models/user.model.js';

export async function processScheduledAccountDeletions(now = new Date(), limit = 25) {
  const users = await User.find({
    status: 'deletion_scheduled',
    deletionScheduledAt: { $lte: now },
  })
    .select('_id')
    .limit(limit);
  for (const user of users) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Promise.all([
          AuthSession.deleteMany({ userId: user._id }).session(session),
          AccountToken.deleteMany({ userId: user._id }).session(session),
          User.deleteOne({ _id: user._id }).session(session),
        ]);
        await appendOutboxEvent(
          {
            name: 'user.deleted',
            aggregateId: String(user._id),
            aggregateType: 'user',
            payload: { userId: String(user._id) },
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
  }
  return users.length;
}
