import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import mongoose from 'mongoose';
import { handleUserCreated } from '../src/modules/users/user-created.handler.js';
import { LearningProfile } from '../src/modules/users/learning-profile/learning-profile.model.js';
import { Profile } from '../src/modules/users/profile/profile.model.js';

const uri = process.env.MONGODB_TEST_URI;
const enabled = Boolean(uri?.includes('_test'));

before(async () => {
  if (enabled) await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
});

after(async () => {
  if (enabled) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test(
  'user.created provisions profile records idempotently',
  { skip: !enabled, timeout: 10_000 },
  async () => {
    const userId = new mongoose.Types.ObjectId();
    const event = { payload: { userId: String(userId), name: 'Ada Learner' } };
    await handleUserCreated(event);
    await handleUserCreated(event);
    assert.equal(await Profile.countDocuments({ userId }), 1);
    assert.equal(await LearningProfile.countDocuments({ userId }), 1);
  },
);
