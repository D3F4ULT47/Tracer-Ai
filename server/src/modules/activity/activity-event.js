import { randomUUID } from 'node:crypto';

export function createActivityEvent({
  userId,
  roadmapId,
  roadmapTitle,
  activityType,
  entityType = 'roadmap',
  entityId = roadmapId,
  shortDescription,
  roadmapVersion,
  runId = `activity-${randomUUID()}`,
  metadata = {},
  timestamp = new Date(),
  anonymousSessionId = null,
}) {
  return Object.freeze({
    activityId: randomUUID(),
    userId,
    ownerId: userId,
    anonymousSessionId,
    roadmapId,
    roadmapTitle,
    activityType,
    entityType,
    entityId,
    shortDescription,
    timestamp,
    roadmapVersion,
    runId,
    metadata,
    schemaVersion: '2.0.0',
  });
}
