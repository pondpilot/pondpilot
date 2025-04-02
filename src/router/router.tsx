import { Layout } from '@components/layout';
import { AppErrorFallback } from '@components/error-fallback';
import { MainPage } from '@pages/main-page';
import { SettingsPage } from '@pages/settings-page';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

// Test component that throws an error
const ErrorThrower = () => {
  throw new Error('This is a test error for testing error boundary functionality');
};

// Define dev-only routes
const devOnlyRoutes = import.meta.env.DEV
  ? [
      {
        path: 'error-test',
        element: <ErrorThrower />,
      },
    ]
  : [];

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <AppErrorFallback />,
    children: [
      {
        index: true,
        element: <MainPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      // Add dev-only routes
      ...devOnlyRoutes,
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
