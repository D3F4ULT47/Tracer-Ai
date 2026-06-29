import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../../users/api/user-api.js';
import { authApi } from '../api/auth-api.js';

export const authKeys = Object.freeze({ me: ['auth', 'me'] });

export function useCurrentUser() {
  return useQuery({ queryKey: authKeys.me, queryFn: userApi.me, retry: false });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => queryClient.setQueryData(authKeys.me, null),
  });
}
