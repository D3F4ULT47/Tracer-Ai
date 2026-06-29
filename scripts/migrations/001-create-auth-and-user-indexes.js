import mongoose from 'mongoose';
import { env } from '../../server/src/config/env.js';
import { AccountToken } from '../../server/src/modules/auth/models/account-token.model.js';
import { AuthSession } from '../../server/src/modules/auth/models/auth-session.model.js';
import { User } from '../../server/src/modules/auth/models/user.model.js';
import { LearningProfile } from '../../server/src/modules/users/learning-profile/learning-profile.model.js';
import { Profile } from '../../server/src/modules/users/profile/profile.model.js';
import { ResumeVersion } from '../../server/src/modules/users/resumes/resume-version.model.js';
import { Resume } from '../../server/src/modules/users/resumes/resume.model.js';
import { OutboxEvent } from '../../server/src/infrastructure/events/outbox-event.model.js';
import { SecurityAuditEvent } from '../../server/src/infrastructure/events/security-audit-event.model.js';

const migrationId = '001-create-auth-and-user-indexes';
const dryRun = process.argv.includes('--dry-run');
const models = [
  User,
  Profile,
  LearningProfile,
  Resume,
  ResumeVersion,
  AuthSession,
  AccountToken,
  OutboxEvent,
  SecurityAuditEvent,
];

await mongoose.connect(env.MONGODB_URI);
const migrations = mongoose.connection.collection('migration_records');
const alreadyApplied = await migrations.findOne({ migrationId });

if (alreadyApplied) {
  console.log(`${migrationId} already applied`);
} else if (dryRun) {
  console.log(
    `Would create indexes for: ${models.map((model) => model.collection.name).join(', ')}`,
  );
} else {
  for (const model of models) await model.createIndexes();
  await migrations.createIndex({ migrationId: 1 }, { unique: true });
  await migrations.insertOne({ migrationId, appliedAt: new Date() });
  console.log(`${migrationId} applied`);
}

await mongoose.disconnect();
