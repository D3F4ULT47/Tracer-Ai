import { randomUUID } from 'node:crypto';
import { Resource } from './models/resource.model.js';
import { canonicalizeResourceUrl, hashResourceUrl } from './resource-url.js';

function persistenceFields(candidate) {
  const canonicalUrl = canonicalizeResourceUrl(candidate.canonicalUrl);
  return {
    canonicalUrl,
    canonicalUrlHash: hashResourceUrl(canonicalUrl),
    identity: {
      resourceId: randomUUID(),
      provider: candidate.provider,
      providerResourceId: candidate.providerResourceId,
      canonicalUrl,
      canonicalUrlHash: hashResourceUrl(canonicalUrl),
    },
    mutable: {
      type: candidate.type,
      title: candidate.title,
      description: candidate.description,
      author: candidate.author,
      language: candidate.language,
      estimatedDurationMinutes: candidate.estimatedDurationMinutes,
      difficulty: candidate.difficulty,
      tags: candidate.tags,
      thumbnailUrl: candidate.thumbnailUrl,
      popularity: candidate.popularity,
      retrievedAt: new Date(candidate.retrievedAt),
      providerMetadata: candidate.providerMetadata,
      metadataVersion: candidate.metadataVersion,
      availabilityStatus: candidate.availabilityStatus,
      accessType: candidate.accessType,
    },
  };
}

export function createResourceRepository({ model = Resource } = {}) {
  return Object.freeze({
    async upsertMany(candidates) {
      if (candidates.length === 0) return [];
      const prepared = [
        ...new Map(
          candidates.map((candidate) => {
            const fields = persistenceFields(candidate);
            return [fields.canonicalUrlHash, fields];
          }),
        ).values(),
      ];
      await model.bulkWrite(
        prepared.map(({ canonicalUrlHash, identity, mutable }) => ({
          updateOne: {
            filter: { canonicalUrlHash },
            update: { $setOnInsert: identity, $set: mutable },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      return model
        .find({ canonicalUrlHash: { $in: prepared.map((item) => item.canonicalUrlHash) } })
        .lean();
    },

    async updateQualitySignals(updates) {
      if (updates.length === 0) return;
      await model.bulkWrite(
        updates.map(({ resourceId, signals, rankingVersion }) => ({
          updateOne: {
            filter: { resourceId },
            update: {
              $set: {
                authorityScore: signals.authorityScore,
                freshnessScore: signals.freshnessScore,
                popularityScore: signals.popularityScore,
                completenessScore: signals.completenessScore,
                providerConfidenceScore: signals.providerConfidenceScore,
                qualityScore: signals.qualityScore,
                qualityScoringVersion: rankingVersion,
              },
            },
          },
        })),
        { ordered: false },
      );
    },
  });
}

export const resourceRepository = createResourceRepository();
