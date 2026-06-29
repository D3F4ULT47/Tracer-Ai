import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { PublicOnlyRoute } from './PublicOnlyRoute.jsx';

const pages = {
  Home: lazyPage(() => import('../pages/HomePage.jsx'), 'HomePage'),
  Login: lazyPage(() => import('../pages/LoginPage.jsx'), 'LoginPage'),
  Signup: lazyPage(() => import('../pages/SignupPage.jsx'), 'SignupPage'),
  VerifyEmail: lazyPage(() => import('../pages/VerifyEmailPage.jsx'), 'VerifyEmailPage'),
  ResetPassword: lazyPage(() => import('../pages/ResetPasswordPage.jsx'), 'ResetPasswordPage'),
  OAuthCallback: lazyPage(() => import('../pages/OAuthCallbackPage.jsx'), 'OAuthCallbackPage'),
  Profile: lazyPage(() => import('../pages/ProfilePage.jsx'), 'ProfilePage'),
  Placeholder: lazyPage(() => import('../pages/PlaceholderPage.jsx'), 'PlaceholderPage'),
  NotFound: lazyPage(() => import('../pages/NotFoundPage.jsx'), 'NotFoundPage'),
};

function lazyPage(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

function render(element) {
  return <Suspense fallback={<div className="route-loading">Loading…</div>}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: render(<pages.Home />) },
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: '/login', element: render(<pages.Login />) },
          { path: '/signup', element: render(<pages.Signup />) },
        ],
      },
      { path: '/verify-email', element: render(<pages.VerifyEmail />) },
      { path: '/reset-password', element: render(<pages.ResetPassword />) },
      { path: '/oauth/callback', element: render(<pages.OAuthCallback />) },
      {
        path: '/shared/:token',
        element: render(
          <pages.Placeholder title="Shared Roadmap" description="Sharing begins in Sprint 6." />,
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/dashboard',
            element: render(
              <pages.Placeholder
                title="Dashboard"
                description="Your learning activity will appear here."
              />,
            ),
          },
          {
            path: '/roadmaps',
            element: render(
              <pages.Placeholder title="My Roadmaps" description="Roadmaps begin in Sprint 2." />,
            ),
          },
          {
            path: '/roadmaps/:id',
            element: render(
              <pages.Placeholder title="Roadmap" description="Roadmaps begin in Sprint 2." />,
            ),
          },
          {
            path: '/resources',
            element: render(
              <pages.Placeholder title="Resources" description="Resources begin in Sprint 3." />,
            ),
          },
          {
            path: '/explore',
            element: render(
              <pages.Placeholder title="Explore" description="Explore is not part of the MVP." />,
            ),
          },
          { path: '/profile', element: render(<pages.Profile />) },
        ],
      },
    ],
  },
  { path: '*', element: render(<pages.NotFound />) },
]);
