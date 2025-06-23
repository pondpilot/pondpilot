import { DesktopOnly } from '@components/desktop-only';
import { DndOverlay } from '@components/dnd-overlay';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { Stack } from '@mantine/core';
import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { Header } from './components/header';

interface LayoutProps {
  isFileAccessApiSupported: boolean;
  isMobileDevice: boolean;
}

export function Layout({ isFileAccessApiSupported, isMobileDevice }: LayoutProps) {
  const { handleFileDrop } = useAddLocalFilesOrFolders();
  const navigate = useNavigate();

  // Listen for navigation events from other parts of the app
  useEffect(() => {
    const handleNavigateEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ route: string }>;
      if (customEvent.detail?.route) {
        navigate(customEvent.detail.route);
      }
    };

    window.addEventListener('navigate-to-route', handleNavigateEvent);

    return () => {
      window.removeEventListener('navigate-to-route', handleNavigateEvent);
    };
  }, [navigate]);

  if (isMobileDevice) {
    return <DesktopOnly />;
  }

  return isFileAccessApiSupported ? (
    <DndOverlay handleFileDrop={handleFileDrop}>
      <Stack gap={0} className="h-full" pos="relative" bg="background-primary">
        <header className="border-b px-4 h-[60px] border-borderPrimary-light dark:border-borderPrimary-dark">
          <Header />
        </header>

        <Outlet />
      </Stack>
    </DndOverlay>
  ) : (
    <Outlet />
  );
}
