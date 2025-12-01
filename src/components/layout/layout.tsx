import { DesktopOnly } from '@components/desktop-only';
import { DndOverlay } from '@components/dnd-overlay';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useIsTauri } from '@hooks/use-is-tauri';
import { Stack } from '@mantine/core';
import { Outlet } from 'react-router-dom';

import { Header } from './components/header';
import { TauriLayout } from './tauri-layout';

interface LayoutProps {
  isFileAccessApiSupported: boolean;
  isMobileDevice: boolean;
}

export function Layout({ isFileAccessApiSupported, isMobileDevice }: LayoutProps) {
  const { handleFileDrop } = useAddLocalFilesOrFolders();
  const isTauri = useIsTauri();

  if (isMobileDevice) {
    return <DesktopOnly />;
  }

  // Use Tauri-specific layout for desktop app
  if (isTauri) {
    return (
      <TauriLayout
        isFileAccessApiSupported={isFileAccessApiSupported}
        isMobileDevice={isMobileDevice}
      />
    );
  }

  // Web version layout
  return isFileAccessApiSupported ? (
    <DndOverlay handleFileDrop={handleFileDrop}>
      <Stack gap={0} className="h-full" pos="relative" bg="background-primary">
        <header className="border-b px-4 h-[54px] flex-shrink-0 flex items-center border-borderPrimary-light dark:border-borderPrimary-dark">
          <div className="w-full">
            <Header />
          </div>
        </header>

        <Outlet />
      </Stack>
    </DndOverlay>
  ) : (
    <Outlet />
  );
}
