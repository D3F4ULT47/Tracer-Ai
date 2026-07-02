import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { AdaptiveHomeLayout } from './AdaptiveHomeLayout.jsx';
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
  MyRoadmaps: lazyPage(() => import('../pages/MyRoadmapsPage.jsx'), 'MyRoadmapsPage'),
  RoadmapWorkspace: lazyPage(
    () => import('../pages/RoadmapWorkspacePage.jsx'),
    'RoadmapWorkspacePage',
  ),
  RoadmapPreview: lazyPage(() => import('../pages/RoadmapPreviewPage.jsx'), 'RoadmapPreviewPage'),
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
    element: <AdaptiveHomeLayout />,
    children: [
      { path: '/', element: render(<pages.Home />) },
      { path: '/roadmaps/preview', element: render(<pages.RoadmapPreview />) },
    ],
  },
  {
    element: <PublicLayout />,
    children: [
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
            element: <Navigate to="/roadmaps" replace />,
          },
          {
            path: '/roadmaps',
            element: render(<pages.MyRoadmaps />),
          },
          {
            path: '/roadmaps/:id',
            element: render(<pages.RoadmapWorkspace />),
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
