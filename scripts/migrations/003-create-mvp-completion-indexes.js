import mongoose from 'mongoose';
import { env } from '../../server/src/config/env.js';
import { RoadmapActivity } from '../../server/src/modules/activity/index.js';
import { Roadmap } from '../../server/src/modules/roadmaps/models/roadmap.model.js';

const migrationId = '003-create-mvp-completion-indexes';
const dryRun = process.argv.includes('--dry-run');

await mongoose.connect(env.MONGODB_URI);
const migrations = mongoose.connection.collection('migration_records');
const alreadyApplied = await migrations.findOne({ migrationId });

if (alreadyApplied) {
  console.log(`${migrationId} already applied`);
} else if (dryRun) {
  console.log(
    `Would create indexes for: ${Roadmap.collection.name}, ${RoadmapActivity.collection.name}`,
  );
} else {
  await Promise.all([Roadmap.createIndexes(), RoadmapActivity.createIndexes()]);
  await migrations.createIndex({ migrationId: 1 }, { unique: true });
  await migrations.insertOne({ migrationId, appliedAt: new Date() });
  console.log(`${migrationId} applied`);
}

await mongoose.disconnect();
