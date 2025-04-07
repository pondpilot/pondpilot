import { Stack } from '@mantine/core';
import { Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider } from '@features/app-context';
import { DuckDBConnectionProvider } from '@features/duckdb-context/duckdb-context';
import { Header } from './components/header';

interface LayoutProps {
  isFileAccessApiSupported: boolean;
}

export function Layout({ isFileAccessApiSupported }: LayoutProps) {
  return isFileAccessApiSupported ? (
    <DuckDBConnectionProvider>
      <QueryClientProvider client={new QueryClient()}>
        <AppProvider>
          <Stack gap={0} className="h-full" bg="background-primary">
            <header className="border-b px-4 h-[60px] border-borderPrimary-light dark:border-borderPrimary-dark">
              <Header />
            </header>

            <Outlet />
          </Stack>
        </AppProvider>
      </QueryClientProvider>
    </DuckDBConnectionProvider>
  ) : (
    <Outlet />
  );
}
