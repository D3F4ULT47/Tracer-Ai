import { useMutation, useQueryClient } from '@tanstack/react-query';
import { roadmapGenerationApi } from '../api/roadmap-generation-api.js';

export function useGenerateRoadmap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roadmapGenerationApi.generate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmaps'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useAnswerRoadmapClarification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roadmapGenerationApi.answerClarification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmaps'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function usePersistRoadmapPreview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roadmapGenerationApi.adoptPreview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmaps'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
