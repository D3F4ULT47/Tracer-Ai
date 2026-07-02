import { useQuery } from '@tanstack/react-query';
import { communityApi } from '../api/community-api.js';

export const communityKeys = Object.freeze({ feed: ['community', 'feed'] });

export function useCommunityFeed() {
  return useQuery({
    queryKey: communityKeys.feed,
    queryFn: communityApi.feed,
    staleTime: 30_000,
  });
}
