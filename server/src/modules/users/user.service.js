import { identityService } from '../auth/index.js';
import { AppError } from '../../shared/app-error.js';
import { LearningProfile } from './learning-profile/learning-profile.model.js';
import { Profile } from './profile/profile.model.js';
import { Resume } from './resumes/resume.model.js';

async function requireRecord(Model, userId, label) {
  const record = await Model.findOne({ userId });
  if (!record)
    throw new AppError(`${label} is still being provisioned`, {
      status: 503,
      code: 'PROFILE_PROVISIONING',
    });
  return record;
}

export const userService = Object.freeze({
  async getMe(userId) {
    const [user, profile, learningProfile] = await Promise.all([
      identityService.getPublicUser(userId),
      Profile.findOne({ userId }).lean(),
      LearningProfile.findOne({ userId }).lean(),
    ]);
    if (!user) throw new AppError('User not found', { status: 404, code: 'USER_NOT_FOUND' });
    return { user, profileProvisioned: Boolean(profile && learningProfile) };
  },
  async getProfile(userId) {
    return requireRecord(Profile, userId, 'Profile');
  },
  async updateProfile(userId, changes) {
    const profile = await requireRecord(Profile, userId, 'Profile');
    Object.assign(profile, changes);
    return profile.save();
  },
  async getLearningProfile(userId) {
    return requireRecord(LearningProfile, userId, 'Learning profile');
  },
  async getLearningContextSources(userId) {
    const [profile, learningProfile] = await Promise.all([
      requireRecord(Profile, userId, 'Profile'),
      requireRecord(LearningProfile, userId, 'Learning profile'),
    ]);
    return {
      profile: profile.toObject(),
      learningProfile: learningProfile.toObject(),
    };
  },
  async updateLearningProfile(userId, changes) {
    const profile = await requireRecord(LearningProfile, userId, 'Learning profile');
    Object.assign(profile, changes);
    return profile.save();
  },
  async clearInferences(userId, field) {
    const filter = { userId };
    const update = field ? { $pull: { inferences: { field } } } : { $set: { inferences: [] } };
    await LearningProfile.updateOne(filter, update);
  },
  listResumes(userId) {
    return Resume.find({ userId })
      .select('name status currentVersionId createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();
  },
  scheduleDeletion(userId) {
    return identityService.scheduleDeletion(userId);
  },
  cancelDeletion(userId) {
    return identityService.cancelDeletion(userId);
  },
});
