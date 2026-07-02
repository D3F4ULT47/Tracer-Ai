const emptyPopularity = Object.freeze({
  views: null,
  likes: null,
  stars: null,
  forks: null,
  rating: null,
  ratingCount: null,
});

export function resourceCandidate(input) {
  const candidate = {
    description: null,
    author: null,
    language: null,
    estimatedDurationMinutes: null,
    difficulty: null,
    tags: [],
    thumbnailUrl: null,
    popularity: { ...emptyPopularity },
    retrievedAt: new Date().toISOString(),
    providerMetadata: {},
    metadataVersion: '1.0.0',
    availabilityStatus: 'available',
    accessType: 'free',
    ...input,
  };
  return {
    ...candidate,
    tags: [...new Set((input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
    popularity: { ...emptyPopularity, ...(input.popularity ?? {}) },
  };
}

export function integer(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
