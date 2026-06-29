import { RouterProvider } from 'react-router-dom';
import { router } from '../routes/router.jsx';

export function App() {
  return <RouterProvider router={router} />;
}
