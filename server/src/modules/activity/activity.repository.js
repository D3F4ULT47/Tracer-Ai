import mongoose from 'mongoose';
import { RoadmapActivity } from './models/roadmap-activity.model.js';

export const activityRepository = Object.freeze({
  append(event, { session } = {}) {
    return RoadmapActivity.create([event], { ...(session ? { session } : {}) });
  },

  deleteForRoadmap({ userId, roadmapId, session }) {
    const owner = new mongoose.Types.ObjectId(userId);
    return RoadmapActivity.deleteMany(
      {
        roadmapId,
        $or: [{ userId: owner }, { ownerId: owner }],
      },
      { ...(session ? { session } : {}) },
    );
  },

  list({ userId, limit, cursor, activityType }) {
    const owner = new mongoose.Types.ObjectId(userId);
    const ownership = { $or: [{ userId: owner }, { ownerId: owner }] };
    const pipeline = [
      { $match: ownership },
      {
        $lookup: {
          from: 'roadmaps',
          localField: 'roadmapId',
          foreignField: 'roadmapId',
          as: 'roadmap',
        },
      },
      { $unwind: '$roadmap' },
      { $match: { 'roadmap.deletedAt': null } },
      {
        $addFields: {
          effectiveTimestamp: { $ifNull: ['$timestamp', '$createdAt'] },
          effectiveActivityId: { $ifNull: ['$activityId', { $toString: '$_id' }] },
        },
      },
      ...(activityType ? [{ $match: { activityType } }] : []),
      ...(cursor
        ? [
            {
              $match: {
                $or: [
                  { effectiveTimestamp: { $lt: cursor.timestamp } },
                  {
                    effectiveTimestamp: cursor.timestamp,
                    effectiveActivityId: { $lt: cursor.activityId },
                  },
                ],
              },
            },
          ]
        : []),
      { $sort: { effectiveTimestamp: -1, effectiveActivityId: -1 } },
      { $limit: limit + 1 },
    ];
    return RoadmapActivity.aggregate(pipeline);
  },
});
