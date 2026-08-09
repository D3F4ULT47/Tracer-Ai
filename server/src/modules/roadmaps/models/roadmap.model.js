import mongoose from 'mongoose';

const roadmapState = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'LOCKED'];
const difficulty = ['beginner', 'intermediate', 'advanced', 'expert'];

function boundedArray(maximum, label) {
  return {
    validator: (value) => value.length <= maximum,
    message: `${label} exceeds the maximum of ${maximum}`,
  };
}

const noteSchema = new mongoose.Schema(
  {
    noteId: { type: String, required: true, immutable: true },
    content: { type: String, required: true, maxlength: 10_000 },
  },
  { _id: false, timestamps: true },
);

const attachmentSchema = new mongoose.Schema(
  {
    attachmentId: { type: String, required: true, immutable: true },
    type: {
      type: String,
      enum: ['youtube', 'github', 'pdf', 'google_doc', 'external_url'],
      required: true,
    },
    url: { type: String, required: true, maxlength: 2_000 },
    title: { type: String, required: true, maxlength: 500 },
    description: { type: String, default: null, maxlength: 2_000 },
    metadata: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, immutable: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, required: true, maxlength: 5_000 },
    estimatedMinutes: { type: Number, required: true, min: 5, max: 2_400 },
    difficulty: { type: String, enum: difficulty, required: true },
    dependencies: { type: [String], default: [], validate: boundedArray(100, 'Task dependencies') },
    completionCriteria: {
      type: [String],
      required: true,
      validate: boundedArray(20, 'Task completion criteria'),
    },
    type: {
      type: String,
      enum: ['learn', 'practice', 'project', 'assessment', 'checkpoint'],
      required: true,
    },
    state: { type: String, enum: roadmapState, default: 'NOT_STARTED' },
    notes: { type: [noteSchema], default: [], validate: boundedArray(100, 'Task notes') },
    resources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    learningExperience: { type: mongoose.Schema.Types.Mixed, default: null },
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: boundedArray(50, 'Task attachments'),
    },
  },
  { _id: false, timestamps: true },
);

const weekSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, immutable: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, required: true, maxlength: 5_000 },
    objective: { type: String, required: true, maxlength: 1_000 },
    weekNumber: { type: Number, required: true, min: 1, max: 520 },
    order: { type: Number, required: true, min: 1 },
    state: { type: String, enum: roadmapState, default: 'NOT_STARTED' },
    dependencies: { type: [String], default: [] },
    milestones: { type: [String], default: [] },
    projects: { type: [String], default: [] },
    checkpoints: { type: [String], default: [] },
    completionCriteria: { type: [String], required: true },
    tasks: { type: [taskSchema], required: true, validate: boundedArray(50, 'Week tasks') },
  },
  { _id: false, timestamps: true },
);

const phaseSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, immutable: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, required: true, maxlength: 5_000 },
    objective: { type: String, required: true, maxlength: 1_000 },
    estimatedWeeks: { type: Number, required: true, min: 1, max: 52 },
    order: { type: Number, required: true, min: 1 },
    state: { type: String, enum: roadmapState, default: 'NOT_STARTED' },
    dependencies: { type: [String], default: [] },
    milestones: { type: [String], default: [] },
    projects: { type: [String], default: [] },
    checkpoints: { type: [String], default: [] },
    completionCriteria: { type: [String], required: true },
    weeks: { type: [weekSchema], required: true, validate: boundedArray(52, 'Phase weeks') },
  },
  { _id: false, timestamps: true },
);

const roadmapSchema = new mongoose.Schema(
  {
    roadmapId: { type: String, required: true, unique: true, immutable: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    anonymousSessionId: { type: String, default: null, index: true, immutable: true },
    contextId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoadmapContext',
      required: true,
      immutable: true,
    },
    currentVersion: { type: Number, required: true, default: 1, min: 1 },
    type: { type: String, enum: ['career', 'skill', 'project', 'resume'], required: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, required: true, maxlength: 5_000 },
    summary: { type: String, required: true, maxlength: 5_000 },
    estimatedWeeks: { type: Number, required: true, min: 1, max: 520 },
    currentLevel: { type: String, enum: difficulty, required: true },
    weeklyCommitmentHours: { type: Number, required: true, min: 1, max: 168 },
    missingSkills: { type: [String], default: [], validate: boundedArray(100, 'Missing skills') },
    aiConfidence: { type: Number, required: true, min: 0, max: 1 },
    difficulty: { type: String, enum: difficulty, required: true },
    completionCriteria: { type: [String], required: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    visibility: { type: String, enum: ['PRIVATE', 'PUBLIC'], default: 'PRIVATE', index: true },
    publishedAt: { type: Date, default: null, index: true },
    lastOpenedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    adoptedAt: { type: Date, default: null },
    phases: { type: [phaseSchema], required: true, validate: boundedArray(30, 'Roadmap phases') },
    schemaVersion: { type: String, default: '2.0.0' },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    collection: 'roadmaps',
    versionKey: 'revision',
  },
);

roadmapSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1 });
roadmapSchema.index({ visibility: 1, publishedAt: -1, deletedAt: 1 });

export const Roadmap = mongoose.models.Roadmap ?? mongoose.model('Roadmap', roadmapSchema);
