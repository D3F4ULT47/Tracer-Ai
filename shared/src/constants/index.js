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
