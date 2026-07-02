import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roadmapApi } from '../api/roadmap-api.js';

export const roadmapKeys = Object.freeze({
  all: ['roadmaps'],
  detail: (roadmapId) => ['roadmaps', roadmapId],
});

export function useRoadmaps() {
  return useQuery({
    queryKey: roadmapKeys.all,
    queryFn: roadmapApi.list,
    staleTime: 60_000,
  });
}

export function useRoadmap(roadmapId) {
  return useQuery({
    queryKey: roadmapKeys.detail(roadmapId),
    queryFn: () => roadmapApi.get(roadmapId),
    enabled: Boolean(roadmapId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useWorkspaceMutation(roadmapId) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `roadmap-${roadmapId}` },
    mutationFn: async ({ operation, ...input }) => {
      const cached = queryClient.getQueryData(roadmapKeys.detail(roadmapId));
      const revision = cached?.data?.workspace?.revision ?? input.revision;
      if (operation === 'update') return roadmapApi.update({ roadmapId, revision, ...input });
      if (operation === 'createNode') {
        return roadmapApi.createNode({ roadmapId, revision, ...input });
      }
      if (operation === 'updateNode') {
        return roadmapApi.updateNode({ roadmapId, revision, ...input });
      }
      return roadmapApi.deleteNode({ roadmapId, revision, ...input });
    },
    onSuccess: (response) => {
      queryClient.setQueryData(roadmapKeys.detail(roadmapId), response);
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useDuplicateRoadmap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roadmapApi.duplicate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useDeleteRoadmap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roadmapApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useRoadmapVisibility(roadmapId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ visibility, revision }) =>
      roadmapApi.setVisibility({ roadmapId, visibility, revision }),
    onSuccess: (response) => {
      queryClient.setQueryData(roadmapKeys.detail(roadmapId), response);
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all });
      queryClient.invalidateQueries({ queryKey: ['community', 'feed'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
