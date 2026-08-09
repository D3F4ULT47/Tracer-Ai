import { AiRun } from '../models/ai-run.model.js';
import { AiUsageRecord } from '../models/ai-usage-record.model.js';

export const aiOwnershipTransferRepository = Object.freeze({
  async adoptRunOwnership({ runIds, ownerId, session }) {
    if (!runIds.length) return;
    await Promise.all([
      AiRun.updateMany(
        { runId: { $in: runIds }, ownerId: null },
        { $set: { ownerId } },
        { session },
      ),
      AiUsageRecord.updateMany(
        { runId: { $in: runIds }, ownerId: null },
        { $set: { ownerId } },
        { session },
      ),
    ]);
  },
});
