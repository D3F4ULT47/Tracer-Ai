import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { authApi } from '../features/auth/api/auth-api.js';
import { queryClient } from '../services/query-client.js';
import { ThemeProvider } from '../theme/ThemeProvider.jsx';

export function AppProviders({ children }) {
  useEffect(() => {
    void authApi.csrf().catch(() => undefined);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
