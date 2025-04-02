import { Layout } from '@components/layout';
import { AppErrorFallback } from '@components/error-fallback';
import { MainPage } from '@pages/main-page';
import { SettingsPage } from '@pages/settings-page';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

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
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
