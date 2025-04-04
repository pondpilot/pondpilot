import { Layout } from '@components/layout';
import { AppErrorFallback } from '@components/error-fallback';
import { MainPage } from '@pages/main-page';
import { SettingsPage } from '@pages/settings-page';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { getBrowserSupportedFeatures } from '@utils/browser';
import { BrowserNotSupported } from '@components/browser-not-supported';

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

const { isFileAccessApiSupported } = getBrowserSupportedFeatures();

const appRoutes = isFileAccessApiSupported
  ? [
      {
        index: true,
        element: <MainPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ]
  : [
      {
        index: true,
        element: <BrowserNotSupported />,
      },
    ];

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout isFileAccessApiSupported={isFileAccessApiSupported} />,
    errorElement: <AppErrorFallback />,
    children: [
      ...appRoutes,
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
