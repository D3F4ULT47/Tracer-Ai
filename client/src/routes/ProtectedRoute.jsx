import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader } from '../components/Loader/index.js';
import { Toast } from '../components/Toast/index.js';
import { useCurrentUser } from '../features/auth/hooks/use-auth.js';

export function ProtectedRoute() {
  const query = useCurrentUser();
  const location = useLocation();
  if (query.isPending) return <Loader label="Checking your session" />;
  if (query.isError && query.error?.status !== 401)
    return <Toast tone="error">Unable to check your session. Try again.</Toast>;
  if (!query.data?.data?.user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
