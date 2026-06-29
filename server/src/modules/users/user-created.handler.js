import { LearningProfile } from './learning-profile/learning-profile.model.js';
import { Profile } from './profile/profile.model.js';

export async function handleUserCreated(event) {
  const { userId, name } = event.payload;
  await Promise.all([
    Profile.updateOne(
      { userId },
      { $setOnInsert: { userId, name: name || 'Tracer AI learner' } },
      { upsert: true },
    ),
    LearningProfile.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true }),
  ]);
}
