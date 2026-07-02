function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

export function presentResource(resource) {
  return {
    resourceId: resource.resourceId,
    provider: resource.provider,
    providerResourceId: resource.providerResourceId,
    type: resource.type,
    canonicalUrl: resource.canonicalUrl,
    canonicalUrlHash: resource.canonicalUrlHash,
    title: resource.title,
    description: resource.description ?? null,
    author: resource.author ?? null,
    language: resource.language ?? null,
    estimatedDurationMinutes: resource.estimatedDurationMinutes ?? null,
    difficulty: resource.difficulty ?? null,
    tags: [...(resource.tags ?? [])],
    thumbnailUrl: resource.thumbnailUrl ?? null,
    popularity: {
      views: resource.popularity?.views ?? null,
      likes: resource.popularity?.likes ?? null,
      stars: resource.popularity?.stars ?? null,
      forks: resource.popularity?.forks ?? null,
      rating: resource.popularity?.rating ?? null,
      ratingCount: resource.popularity?.ratingCount ?? null,
    },
    retrievedAt: iso(resource.retrievedAt),
    providerMetadata: structuredClone(resource.providerMetadata ?? {}),
    metadataVersion: resource.metadataVersion,
    availabilityStatus: resource.availabilityStatus,
    accessType: resource.accessType,
    authorityScore: resource.authorityScore ?? null,
    freshnessScore: resource.freshnessScore ?? null,
    popularityScore: resource.popularityScore ?? null,
    completenessScore: resource.completenessScore ?? null,
    providerConfidenceScore: resource.providerConfidenceScore ?? null,
    qualityScore: resource.qualityScore ?? null,
    qualityScoringVersion: resource.qualityScoringVersion ?? null,
    createdAt: iso(resource.createdAt),
    updatedAt: iso(resource.updatedAt),
  };
}
