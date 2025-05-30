import { BrowserNotSupported } from '@components/browser-not-supported';
import { AppErrorFallback } from '@components/error-fallback';
import { Layout } from '@components/layout';
import { useFeatureContext } from '@features/feature-context';
import { SharedScriptImport } from '@features/script-import';
import { MainPage } from '@pages/main-page';
import { SettingsPage } from '@pages/settings-page';
import { createBrowserRouter, RouterProvider, Navigate, RouteObject } from 'react-router-dom';

let devOnlyRoutes: RouteObject[] = [];

// This will tree-shake in production
if (import.meta.env.DEV || __INTEGRATION_TEST__) {
  // Test component that throws an error
  const ErrorThrower = () => {
    throw new Error('This is a test error for testing error boundary functionality');
  };

  // Define dev-only routes
  devOnlyRoutes = [
    {
      path: 'error-test',
      element: <ErrorThrower />,
    },
  ];
}

export function Router() {
  const { isFileAccessApiSupported, isMobileDevice, isOPFSSupported } = useFeatureContext();

  // Block app if either File Access API or OPFS is not supported
  const canUseApp = isFileAccessApiSupported && isOPFSSupported;

  const appRoutes = canUseApp
    ? [
        {
          index: true,
          element: <MainPage />,
        },
        {
          path: 'settings',
          element: <SettingsPage />,
        },
        {
          path: 'shared-script/:encodedScript',
          element: <SharedScriptImport />,
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
      element: <Layout isFileAccessApiSupported={canUseApp} isMobileDevice={isMobileDevice} />,
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

  return <RouterProvider router={router} />;
}
