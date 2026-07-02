import { createHash } from 'node:crypto';

const legacyTypes = Object.freeze({
  roadmap_generated: 'ROADMAP_CREATED',
  roadmap_edited: 'ROADMAP_UPDATED',
  roadmap_duplicated: 'ROADMAP_FORKED',
  roadmap_deleted: 'ROADMAP_DELETED',
});

function legacyId(value) {
  const hex = createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function presentActivity(activity) {
  const activityType = activity.activityType ?? legacyTypes[activity.type] ?? 'ROADMAP_UPDATED';
  return {
    activityId: activity.activityId ?? legacyId(activity._id),
    userId: String(activity.userId ?? activity.ownerId),
    roadmapId: activity.roadmapId,
    roadmapTitle: activity.roadmapTitle ?? activity.metadata?.roadmapTitle ?? 'Roadmap',
    activityType,
    entityType: activity.entityType ?? 'roadmap',
    entityId: activity.entityId ?? activity.roadmapId,
    shortDescription:
      activity.shortDescription ?? activity.metadata?.changeSummary ?? 'Roadmap activity recorded.',
    timestamp: new Date(activity.timestamp ?? activity.createdAt).toISOString(),
    metadata: structuredClone(activity.metadata ?? {}),
  };
}
