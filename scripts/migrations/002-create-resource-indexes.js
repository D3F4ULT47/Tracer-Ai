import mongoose from 'mongoose';
import { env } from '../../server/src/config/env.js';
import { Resource } from '../../server/src/modules/resources/models/resource.model.js';

const migrationId = '002-create-resource-indexes';
const dryRun = process.argv.includes('--dry-run');

await mongoose.connect(env.MONGODB_URI);
const migrations = mongoose.connection.collection('migration_records');
const alreadyApplied = await migrations.findOne({ migrationId });

if (alreadyApplied) {
  console.log(`${migrationId} already applied`);
} else if (dryRun) {
  console.log(`Would create indexes for: ${Resource.collection.name}`);
} else {
  await Resource.createIndexes();
  await migrations.createIndex({ migrationId: 1 }, { unique: true });
  await migrations.insertOne({ migrationId, appliedAt: new Date() });
  console.log(`${migrationId} applied`);
}

await mongoose.disconnect();
