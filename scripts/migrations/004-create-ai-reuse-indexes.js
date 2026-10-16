import mongoose from 'mongoose';
import { env } from '../../server/src/config/env.js';
import { AiIdempotencyKey } from '../../server/src/modules/ai/models/ai-idempotency-key.model.js';
import { AiRun } from '../../server/src/modules/ai/models/ai-run.model.js';
import { AiUsageRecord } from '../../server/src/modules/ai/models/ai-usage-record.model.js';

const migrationId = '004-create-ai-reuse-indexes';
const dryRun = process.argv.includes('--dry-run');
const models = [AiIdempotencyKey, AiRun, AiUsageRecord];

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
