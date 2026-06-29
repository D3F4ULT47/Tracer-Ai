import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../api/user-api.js';

export function useProfile() {
  return useQuery({ queryKey: ['users', 'profile'], queryFn: userApi.profile });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'profile'] }),
  });
}
