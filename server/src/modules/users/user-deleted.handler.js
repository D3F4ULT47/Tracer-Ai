import { LearningProfile } from './learning-profile/learning-profile.model.js';
import { Profile } from './profile/profile.model.js';
import { ResumeVersion } from './resumes/resume-version.model.js';
import { Resume } from './resumes/resume.model.js';

export async function handleUserDeleted(event) {
  const { userId } = event.payload;
  await Promise.all([
    Profile.deleteMany({ userId }),
    LearningProfile.deleteMany({ userId }),
    Resume.deleteMany({ userId }),
    ResumeVersion.deleteMany({ userId }),
  ]);
}
