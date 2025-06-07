import { Stack } from '@mantine/core';
import { Outlet } from 'react-router-dom';

import { DesktopOnly } from '@components/desktop-only';
import { DndOverlay } from '@components/dnd-overlay';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';

import { Header } from './components/header';

interface LayoutProps {
  isFileAccessApiSupported: boolean;
  isMobileDevice: boolean;
}

export function Layout({ isFileAccessApiSupported, isMobileDevice }: LayoutProps) {
  const { handleFileDrop } = useAddLocalFilesOrFolders();
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
