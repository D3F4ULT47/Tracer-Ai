import { AiPrompt } from '../models/ai-prompt.model.js';
import { AiRun } from '../models/ai-run.model.js';
import { AiUsageRecord } from '../models/ai-usage-record.model.js';

export const sourceUnderstandingRepository = Object.freeze({
  prompts: Object.freeze({
    ensure(prompt) {
      return AiPrompt.updateOne(
        { name: prompt.name, version: prompt.version, hash: prompt.hash },
        {
          $setOnInsert: {
            hash: prompt.hash,
            sourcePath: `prompts/${prompt.name}/${prompt.version}.md`,
          },
          $set: { status: 'active' },
        },
        { upsert: true },
      );
    },
  }),
  runs: Object.freeze({
    create(data) {
      return AiRun.create(data);
    },
    complete(runId) {
      return AiRun.updateOne({ runId }, { $set: { status: 'completed', completedAt: new Date() } });
    },
    fail(runId, error) {
      return AiRun.updateOne(
        { runId },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            sanitizedError: { code: error.code, message: error.message },
          },
        },
      );
    },
  }),
  usage: Object.freeze({
    record(data) {
      return AiUsageRecord.create(data);
    },
  }),
});
