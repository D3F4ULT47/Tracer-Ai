import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../shared/app-error.js';
import { activityRepository, createActivityEvent } from '../activity/index.js';
import { RoadmapContext } from './models/roadmap-context.model.js';
import { RoadmapGeneration } from './models/roadmap-generation.model.js';
import { RoadmapVersion } from './models/roadmap-version.model.js';
import { Roadmap } from './models/roadmap.model.js';
import { snapshotRoadmap } from './roadmap-snapshot.js';

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function notFound() {
  return new AppError('Roadmap was not found', { status: 404, code: 'ROADMAP_NOT_FOUND' });
}

async function loadVersions(roadmapId, session) {
  const [currentVersion, initialVersion] = await Promise.all([
    RoadmapVersion.findOne({ roadmapId }).sort({ version: -1 }).session(session),
    RoadmapVersion.findOne({ roadmapId, version: 1 }).session(session),
  ]);
  if (!currentVersion || !initialVersion) throw notFound();
  return { currentVersion, initialVersion };
}

async function loadPlanningGraph(roadmapId, version, session) {
  if (version.planningGraphSnapshot) return structuredClone(version.planningGraphSnapshot);
  const generation = await RoadmapGeneration.findOne({ roadmapId })
    .sort({ createdAt: -1 })
    .session(session);
  if (!generation?.planningGraph) {
    throw new AppError('Roadmap planning graph is unavailable', {
      status: 409,
      code: 'ROADMAP_PLANNING_GRAPH_MISSING',
    });
  }
  return structuredClone(generation.planningGraph);
}

async function loadContext(contextId, session) {
  const query = RoadmapContext.findById(contextId);
  return session ? query.session(session) : query;
}

export const roadmapRepository = Object.freeze({
  async list(ownerId) {
    return Roadmap.find({ ownerId, deletedAt: null })
      .sort({ lastOpenedAt: -1, updatedAt: -1 })
      .limit(100);
  },

  async get(ownerId, roadmapId, { touch = false } = {}) {
    const roadmap = await Roadmap.findOne({ ownerId, roadmapId, deletedAt: null });
    if (!roadmap) throw notFound();
    if (touch) {
      roadmap.lastOpenedAt = new Date();
      await Roadmap.updateOne(
        { _id: roadmap._id },
        { $set: { lastOpenedAt: roadmap.lastOpenedAt } },
        { timestamps: false },
      );
    }
    return {
      roadmap,
      ...(await loadVersions(roadmapId)),
      context: await loadContext(roadmap.contextId),
    };
  },

  async mutate({ ownerId, roadmapId, revision, changeSummary, apply }) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const roadmap = await Roadmap.findOne({ ownerId, roadmapId, deletedAt: null }).session(
          session,
        );
        if (!roadmap) throw notFound();
        if (roadmap.revision !== revision) {
          throw new AppError('Roadmap changed since it was loaded', {
            status: 409,
            code: 'ROADMAP_REVISION_CONFLICT',
            details: { expectedRevision: roadmap.revision },
          });
        }

        const { currentVersion, initialVersion } = await loadVersions(roadmapId, session);
        const planningGraph = await loadPlanningGraph(roadmapId, currentVersion, session);
        const activity = await apply({ roadmap, planningGraph });
        roadmap.currentVersion += 1;
        await roadmap.save({ session });

        const snapshot = snapshotRoadmap(roadmap);
        const [version] = await RoadmapVersion.create(
          [
            {
              roadmapId,
              ownerId,
              contextId: roadmap.contextId,
              generationId: null,
              version: roadmap.currentVersion,
              source: 'manual_edit',
              snapshot,
              planningGraphSnapshot: planningGraph,
              snapshotHash: hash(snapshot),
              promptVersion: currentVersion.promptVersion,
              model: currentVersion.model,
              generatedAt: new Date(),
              learningContextVersion: currentVersion.learningContextVersion,
              editorId: ownerId,
              changeSummary,
            },
          ],
          { session },
        );
        await activityRepository.append(
          createActivityEvent({
            userId: ownerId,
            roadmapId,
            roadmapTitle: roadmap.title,
            roadmapVersion: roadmap.currentVersion,
            activityType: activity?.activityType ?? 'ROADMAP_UPDATED',
            entityType: activity?.entityType ?? 'roadmap',
            entityId: activity?.entityId ?? roadmapId,
            shortDescription: activity?.shortDescription ?? changeSummary,
            metadata: { changeSummary, ...(activity?.metadata ?? {}) },
          }),
          { session },
        );
        result = {
          roadmap,
          currentVersion: version,
          initialVersion,
          context: await loadContext(roadmap.contextId, session),
        };
      });
      return result;
    } finally {
      await session.endSession();
    }
  },

  async duplicate(ownerId, roadmapId) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const source = await Roadmap.findOne({ ownerId, roadmapId, deletedAt: null }).session(
          session,
        );
        if (!source) throw notFound();
        const { currentVersion } = await loadVersions(roadmapId, session);
        const snapshot = snapshotRoadmap(source);
        for (const phase of snapshot.phases) {
          phase.state = 'NOT_STARTED';
          for (const week of phase.weeks) {
            week.state = 'NOT_STARTED';
            for (const task of week.tasks) {
              task.state = 'NOT_STARTED';
              task.notes = [];
            }
          }
        }

        const duplicateRoadmapId = randomUUID();
        const [roadmap] = await Roadmap.create(
          [
            {
              roadmapId: duplicateRoadmapId,
              ownerId,
              contextId: source.contextId,
              currentVersion: 1,
              type: snapshot.type,
              title: `${snapshot.title} (Copy)`,
              description: snapshot.description,
              summary: snapshot.summary,
              estimatedWeeks: snapshot.estimatedWeeks,
              currentLevel: snapshot.currentLevel,
              weeklyCommitmentHours: snapshot.weeklyCommitmentHours,
              missingSkills: snapshot.missingSkills,
              aiConfidence: snapshot.confidence,
              difficulty: snapshot.difficulty,
              completionCriteria: snapshot.completionCriteria,
              visibility: 'PRIVATE',
              publishedAt: null,
              phases: snapshot.phases,
            },
          ],
          { session },
        );
        const duplicateSnapshot = snapshotRoadmap(roadmap);
        const [version] = await RoadmapVersion.create(
          [
            {
              roadmapId: duplicateRoadmapId,
              ownerId,
              contextId: source.contextId,
              generationId: null,
              version: 1,
              source: 'duplicate',
              snapshot: duplicateSnapshot,
              planningGraphSnapshot: await loadPlanningGraph(roadmapId, currentVersion, session),
              snapshotHash: hash(duplicateSnapshot),
              promptVersion: currentVersion.promptVersion,
              model: currentVersion.model,
              generatedAt: new Date(),
              learningContextVersion: currentVersion.learningContextVersion,
              editorId: ownerId,
              changeSummary: `Duplicated from ${roadmapId}`,
            },
          ],
          { session },
        );
        await activityRepository.append(
          createActivityEvent({
            userId: ownerId,
            roadmapId: duplicateRoadmapId,
            roadmapTitle: roadmap.title,
            roadmapVersion: 1,
            activityType: 'ROADMAP_FORKED',
            shortDescription: `Duplicated ${source.title} as a private roadmap.`,
            metadata: { sourceRoadmapId: roadmapId },
          }),
          { session },
        );
        result = {
          roadmap,
          currentVersion: version,
          initialVersion: version,
          context: await loadContext(roadmap.contextId, session),
        };
      });
      return result;
    } finally {
      await session.endSession();
    }
  },

  async softDelete(ownerId, roadmapId) {
    const session = await mongoose.startSession();
    try {
      let deletedAt;
      await session.withTransaction(async () => {
        const roadmap = await Roadmap.findOne({ ownerId, roadmapId, deletedAt: null }).session(
          session,
        );
        if (!roadmap) throw notFound();
        deletedAt = new Date();
        roadmap.deletedAt = deletedAt;
        roadmap.deletedBy = ownerId;
        await roadmap.save({ session });
        await activityRepository.append(
          createActivityEvent({
            userId: ownerId,
            roadmapId,
            roadmapTitle: roadmap.title,
            roadmapVersion: roadmap.currentVersion,
            activityType: 'ROADMAP_DELETED',
            shortDescription: `Moved ${roadmap.title} to recoverable deletion.`,
            metadata: { recoverable: true },
          }),
          { session },
        );
      });
      return { roadmapId, deletedAt: deletedAt.toISOString() };
    } finally {
      await session.endSession();
    }
  },

  async setVisibility({ ownerId, roadmapId, revision, visibility }) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const roadmap = await Roadmap.findOne({ ownerId, roadmapId, deletedAt: null }).session(
          session,
        );
        if (!roadmap) throw notFound();
        if (roadmap.revision !== revision) {
          throw new AppError('Roadmap changed since it was loaded', {
            status: 409,
            code: 'ROADMAP_REVISION_CONFLICT',
            details: { expectedRevision: roadmap.revision },
          });
        }
        const currentVisibility = roadmap.visibility ?? 'PRIVATE';
        if (currentVisibility !== visibility) {
          roadmap.visibility = visibility;
          roadmap.publishedAt = visibility === 'PUBLIC' ? new Date() : null;
          await roadmap.save({ session });
          await activityRepository.append(
            createActivityEvent({
              userId: ownerId,
              roadmapId,
              roadmapTitle: roadmap.title,
              roadmapVersion: roadmap.currentVersion,
              activityType: visibility === 'PUBLIC' ? 'ROADMAP_PUBLISHED' : 'ROADMAP_UNPUBLISHED',
              shortDescription:
                visibility === 'PUBLIC'
                  ? `Published ${roadmap.title} to the community.`
                  : `Made ${roadmap.title} private.`,
              metadata: { visibility },
            }),
            { session },
          );
        }
        const { currentVersion, initialVersion } = await loadVersions(roadmapId, session);
        result = {
          roadmap,
          currentVersion,
          initialVersion,
          context: await loadContext(roadmap.contextId, session),
        };
      });
      return result;
    } finally {
      await session.endSession();
    }
  },
});
