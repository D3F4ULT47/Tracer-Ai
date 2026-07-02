import { Navigate, Outlet } from 'react-router-dom';
import { Loader } from '../components/Loader/index.js';
import { consumeAuthReturn } from '../features/auth/auth-return.js';
import { useCurrentUser } from '../features/auth/hooks/use-auth.js';

export function PublicOnlyRoute() {
  const query = useCurrentUser();
  if (query.isPending) return <Loader label="Checking your session" />;
  if (query.data?.data?.user) return <Navigate to={consumeAuthReturn('/')} replace />;
  return <Outlet />;
}
