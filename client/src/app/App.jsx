import { RouterProvider } from 'react-router-dom';
import { router } from '../routes/router.jsx';
import { AppErrorBoundary } from './AppErrorBoundary.jsx';

export function App() {
  return (
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  );
}
