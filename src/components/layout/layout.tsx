import { Stack } from '@mantine/core';
import { Outlet } from 'react-router-dom';

import { Header } from './components/header';

export function Layout() {
  return (
    <>
      <Stack gap={0} className="h-full" bg="background-primary">
        <header className="border-b px-4 h-[60px] border-borderPrimary-light dark:border-borderPrimary-dark">
          <Header />
        </header>

        <Outlet />
      </Stack>
    </>
  );
}
