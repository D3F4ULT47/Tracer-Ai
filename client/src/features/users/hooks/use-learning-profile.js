import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../api/user-api.js';

export function useLearningProfile() {
  return useQuery({ queryKey: ['users', 'learning-profile'], queryFn: userApi.learningProfile });
}

export function useUpdateLearningProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: userApi.updateLearningProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'learning-profile'] }),
  });
}
