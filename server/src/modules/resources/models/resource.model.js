import mongoose from 'mongoose';

const popularitySchema = new mongoose.Schema(
  {
    views: { type: Number, min: 0, default: null },
    likes: { type: Number, min: 0, default: null },
    stars: { type: Number, min: 0, default: null },
    forks: { type: Number, min: 0, default: null },
    rating: { type: Number, min: 0, max: 5, default: null },
    ratingCount: { type: Number, min: 0, default: null },
  },
  { _id: false },
);

const resourceSchema = new mongoose.Schema(
  {
    resourceId: { type: String, required: true, unique: true, immutable: true },
    provider: {
      type: String,
      enum: ['youtube', 'github', 'official_docs'],
      required: true,
      immutable: true,
    },
    providerResourceId: { type: String, required: true, maxlength: 500, immutable: true },
    type: {
      type: String,
      enum: [
        'video',
        'playlist',
        'repository',
        'documentation',
        'course',
        'project',
        'reference',
        'article',
      ],
      required: true,
    },
    canonicalUrl: { type: String, required: true, maxlength: 2048 },
    canonicalUrlHash: { type: String, required: true, unique: true, immutable: true },
    title: { type: String, required: true, maxlength: 500 },
    description: { type: String, maxlength: 5_000, default: null },
    author: { type: String, maxlength: 300, default: null },
    language: { type: String, maxlength: 50, default: null },
    estimatedDurationMinutes: { type: Number, min: 0, max: 100_000, default: null },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'expert', null],
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (value) => value.length <= 50,
        message: 'Resource tags exceed the maximum of 50',
      },
    },
    thumbnailUrl: { type: String, maxlength: 2048, default: null },
    popularity: { type: popularitySchema, required: true, default: () => ({}) },
    retrievedAt: { type: Date, required: true },
    providerMetadata: { type: mongoose.Schema.Types.Mixed, required: true, default: () => ({}) },
    metadataVersion: { type: String, required: true, default: '1.0.0' },
    availabilityStatus: {
      type: String,
      enum: ['available', 'unavailable', 'unknown'],
      default: 'unknown',
    },
    accessType: {
      type: String,
      enum: ['free', 'paid', 'mixed', 'unknown'],
      default: 'unknown',
    },
    authorityScore: { type: Number, min: 0, max: 100, default: null },
    freshnessScore: { type: Number, min: 0, max: 100, default: null },
    popularityScore: { type: Number, min: 0, max: 100, default: null },
    completenessScore: { type: Number, min: 0, max: 100, default: null },
    providerConfidenceScore: { type: Number, min: 0, max: 100, default: null },
    qualityScore: { type: Number, min: 0, max: 100, default: null },
    qualityScoringVersion: { type: String, maxlength: 50, default: null },
  },
  {
    timestamps: true,
    collection: 'resources',
    optimisticConcurrency: true,
  },
);

resourceSchema.index({ provider: 1, providerResourceId: 1 }, { unique: true });
resourceSchema.index({ tags: 1 });
resourceSchema.index({ provider: 1, retrievedAt: -1 });

export const Resource = mongoose.models.Resource ?? mongoose.model('Resource', resourceSchema);
