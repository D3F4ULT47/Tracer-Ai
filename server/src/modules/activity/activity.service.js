import { ACTIVITY_TYPES } from '@tracer-ai/shared/contracts';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { activityRepository } from './activity.repository.js';
import { presentActivity } from './activity.presenter.js';

const querySchema = z.object({
  cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
});

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const timestamp = new Date(parsed.timestamp);
    if (!parsed.activityId || Number.isNaN(timestamp.getTime())) throw new Error('invalid');
    return { timestamp, activityId: String(parsed.activityId) };
  } catch {
    throw new AppError('Activity cursor is invalid', {
      status: 422,
      code: 'ACTIVITY_CURSOR_INVALID',
    });
  }
}

function encodeCursor({ timestamp, activityId }) {
  return Buffer.from(JSON.stringify({ timestamp, activityId })).toString('base64url');
}

export function createActivityService({ repository = activityRepository } = {}) {
  return Object.freeze({
    async list(userId, query = {}) {
      const parsed = querySchema.safeParse(query);
      if (!parsed.success) {
        throw new AppError('Activity query is invalid', {
          status: 422,
          code: 'ACTIVITY_QUERY_INVALID',
        });
      }
      const { limit, activityType } = parsed.data;
      const records = await repository.list({
        userId,
        limit,
        activityType,
        cursor: decodeCursor(parsed.data.cursor),
      });
      const selected = records.slice(0, limit);
      const activities = selected.map(presentActivity);
      const lastRecord = selected.at(-1);
      return {
        activities,
        nextCursor:
          records.length > limit
            ? encodeCursor({
                timestamp:
                  lastRecord.effectiveTimestamp ?? lastRecord.timestamp ?? lastRecord.createdAt,
                activityId: lastRecord.effectiveActivityId ?? lastRecord.activityId,
              })
            : null,
      };
    },
  });
}

export const activityService = createActivityService();
