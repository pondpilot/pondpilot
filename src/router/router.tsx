import { Layout } from '@components/layout';
import { AppErrorFallback } from '@features/error-fallback';
import { DataViewErrorFallback } from '@features/error-fallback/views/data-view-error-fallback';
import { MainPage } from '@pages/main-page';
import { lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const SettingsPage = lazy(() => import('@pages/settings-page/settings-page'));

const router = createBrowserRouter(
  [
    {
      element: (
        <ErrorBoundary FallbackComponent={AppErrorFallback}>
          <Layout />
        </ErrorBoundary>
      ),
      hasErrorBoundary: false,
      children: [
        {
          path: '/',
          hasErrorBoundary: false,
          element: (
            <ErrorBoundary FallbackComponent={DataViewErrorFallback}>
              <MainPage />
            </ErrorBoundary>
          ),
        },
        {
          path: '/settings',
          hasErrorBoundary: false,
          element: (
            <ErrorBoundary FallbackComponent={DataViewErrorFallback}>
              <SettingsPage />
            </ErrorBoundary>
          ),
        },
      ],
    },
  ],
  {},
);

export function Router() {
  return <RouterProvider router={router} />;
}
