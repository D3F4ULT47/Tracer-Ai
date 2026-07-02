import { Outlet } from 'react-router-dom';
import { useCurrentUser } from '../features/auth/hooks/use-auth.js';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { PublicLayout } from '../layouts/PublicLayout.jsx';

export function AdaptiveHomeLayout() {
  const query = useCurrentUser();

  if (query.data?.data?.user) {
    return (
      <AppLayout>
        <Outlet />
      </AppLayout>
    );
  }

  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
