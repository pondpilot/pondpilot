import { Stack } from '@mantine/core';
import { Outlet } from 'react-router-dom';
import { Header } from './components/header';

interface LayoutProps {
  isFileAccessApiSupported: boolean;
}

export function Layout({ isFileAccessApiSupported }: LayoutProps) {
  return isFileAccessApiSupported ? (
    <Stack gap={0} className="h-full" bg="background-primary">
      <header className="border-b px-4 h-[60px] border-borderPrimary-light dark:border-borderPrimary-dark">
        <Header />
      </header>

      <Outlet />
    </Stack>
  ) : (
    <Outlet />
  );
}
