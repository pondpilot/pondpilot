import { Layout } from '@components/layout';
import { AppErrorFallback, DataViewErrorFallback } from '@components/error-fallback';
import { MainPage } from '@pages/main-page';
import { SettingsPage } from '@pages/settings-page';
import { ErrorBoundary } from 'react-error-boundary';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <AppErrorFallback />,
    children: [
      {
        index: true,
        element: (
          <ErrorBoundary FallbackComponent={DataViewErrorFallback}>
            <MainPage />
          </ErrorBoundary>
        ),
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
