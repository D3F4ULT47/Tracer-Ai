import { useQuery } from '@tanstack/react-query';
import { activityApi } from '../api/activity-api.js';

export const activityKeys = Object.freeze({ all: ['activity'], recent: ['activity', 'recent'] });

export function useRecentActivity({ enabled = true } = {}) {
  return useQuery({
    queryKey: activityKeys.recent,
    queryFn: () => activityApi.list({ limit: 10 }),
    enabled,
    staleTime: 30_000,
  });
}
