export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

export const AI_RUN_STATUSES = Object.freeze([
  'queued',
  'running',
  'waiting_for_clarification',
  'completed',
  'failed',
  'cancelled',
]);

export const ROADMAP_TYPES = Object.freeze(['career', 'skill', 'project', 'interview']);

export const PREPARATION_ROUTER_VERSION = '1.0.0';

export const PREPARATION_STATES = Object.freeze({
  REQUIRED: 'REQUIRED',
  NOT_REQUIRED: 'NOT_REQUIRED',
  ALREADY_AVAILABLE: 'ALREADY_AVAILABLE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  FAILED: 'FAILED',
});

export const PREPARATION_OPERATIONS = Object.freeze({
  SOURCE_UNDERSTANDING: 'source_understanding',
  LEARNER_ASSESSMENT: 'learner_assessment',
  COMBINED_PREPARATION: 'combined_preparation',
});

export const SOURCE_RETRIEVAL_STATUSES = Object.freeze([
  'retrieved',
  'retrieval_failed',
  'not_applicable',
]);

export const SOURCE_UNDERSTANDING_STATUSES = Object.freeze([
  'understood',
  'understanding_failed',
  'not_required',
]);

export const DEFAULT_UNKNOWN_LEVEL_DEPTH = 'beginner_to_intermediate';
