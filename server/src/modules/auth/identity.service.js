import { User } from './models/user.model.js';
import { authService } from './auth.service.js';

export const identityService = Object.freeze({
  async getPublicUser(userId) {
    const user = await User.findById(userId);
    return user ? authService.sanitizeUser(user) : null;
  },
  async scheduleDeletion(userId) {
    const deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await User.updateOne({ _id: userId }, { status: 'deletion_scheduled', deletionScheduledAt });
    return deletionScheduledAt;
  },
  async cancelDeletion(userId) {
    await User.updateOne(
      { _id: userId, status: 'deletion_scheduled' },
      { status: 'active', $unset: { deletionScheduledAt: 1 } },
    );
  },
});
