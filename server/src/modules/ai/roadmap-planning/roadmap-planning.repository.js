import mongoose from 'mongoose';
import { RoadmapActivity } from '../../activity/index.js';
import {
  Roadmap,
  RoadmapContext,
  RoadmapGeneration,
  RoadmapVersion,
} from '../../roadmaps/index.js';
import { AiPrompt } from '../models/ai-prompt.model.js';
import { AiRun } from '../models/ai-run.model.js';
import { AiUsageRecord } from '../models/ai-usage-record.model.js';

export const roadmapPlanningRepository = Object.freeze({
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
    complete(runId, roadmapId, reviewSummary) {
      return AiRun.updateOne(
        { runId },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            acceptedRoadmapId: roadmapId,
            reviewSummary,
          },
        },
      );
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

  async persistInitialGeneration(bundle) {
    const session = await mongoose.startSession();
    try {
      let persisted;
      await session.withTransaction(async () => {
        const generationId = new mongoose.Types.ObjectId();
        const [context] = await RoadmapContext.create([bundle.context], { session });
        const [roadmap] = await Roadmap.create([{ ...bundle.roadmap, contextId: context._id }], {
          session,
        });
        await RoadmapGeneration.create(
          [
            {
              _id: generationId,
              ...bundle.generation,
              contextId: context._id,
            },
          ],
          { session },
        );
        await RoadmapVersion.create(
          [
            {
              ...bundle.version,
              contextId: context._id,
              generationId,
            },
          ],
          { session },
        );
        await RoadmapActivity.create([bundle.activity], { session });
        persisted = { roadmapId: roadmap.roadmapId, contextId: context._id, generationId };
      });
      return persisted;
    } finally {
      await session.endSession();
    }
  },
});
