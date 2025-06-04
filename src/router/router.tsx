import { BrowserNotSupported } from '@components/browser-not-supported';
import { AppErrorFallback } from '@components/error-fallback';
import { Layout } from '@components/layout';
import { MultipleTabsBlocked } from '@components/multiple-tabs-blocked';
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
  const { isFileAccessApiSupported, isMobileDevice, isOPFSSupported, isTabBlocked } =
    useFeatureContext();
  const canUseApp = isFileAccessApiSupported && isOPFSSupported;

  if (isTabBlocked) {
    return <MultipleTabsBlocked />;
  }

  const getAppRoutes = () => {
    if (!canUseApp) {
      return [
        {
          index: true,
          element: <BrowserNotSupported />,
        },
      ];
    }

    return [
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
    ];
  };

  const router = createBrowserRouter([
    {
      path: '/',
      element: <Layout isFileAccessApiSupported={canUseApp} isMobileDevice={isMobileDevice} />,
      errorElement: <AppErrorFallback />,
      children: [
        ...getAppRoutes(),
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
