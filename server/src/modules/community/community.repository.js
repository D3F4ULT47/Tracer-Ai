import { Roadmap } from '../roadmaps/index.js';
import { Profile } from '../users/index.js';

export function createCommunityRepository({ RoadmapModel = Roadmap, ProfileModel = Profile } = {}) {
  return Object.freeze({
    async listNewestPublic(limit = 20) {
      const roadmaps = await RoadmapModel.find({
        visibility: 'PUBLIC',
        publishedAt: { $ne: null },
        deletedAt: null,
      })
        .sort({ publishedAt: -1, roadmapId: -1 })
        .limit(limit)
        .lean();
      const profiles = await ProfileModel.find({
        userId: { $in: [...new Set(roadmaps.map((roadmap) => String(roadmap.ownerId)))] },
      })
        .select({ userId: 1, name: 1 })
        .lean();
      const names = new Map(profiles.map((profile) => [String(profile.userId), profile.name]));
      return roadmaps.map((roadmap) => ({
        roadmapId: roadmap.roadmapId,
        title: roadmap.title,
        summary: roadmap.summary,
        type: roadmap.type,
        difficulty: roadmap.difficulty,
        estimatedWeeks: roadmap.estimatedWeeks,
        creatorName: names.get(String(roadmap.ownerId)) ?? null,
        publishedAt: roadmap.publishedAt.toISOString(),
      }));
    },
  });
}

export const communityRepository = createCommunityRepository();
