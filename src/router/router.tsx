import { Layout } from '@components/layout';
import { AppErrorFallback } from '@features/error-fallback';
import { DataViewErrorFallback } from '@features/error-fallback/views/data-view-error-fallback';
import { MainPage } from '@pages/main-page';
import { ErrorBoundary } from 'react-error-boundary';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

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
      ],
    },
  ],
  {},
);

export function Router() {
  return <RouterProvider router={router} />;
}
