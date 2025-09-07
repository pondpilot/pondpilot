import { DndOverlay } from '@components/dnd-overlay';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useMenuEvents } from '@hooks/use-menu-events';
import { Stack, ActionIcon, Tooltip } from '@mantine/core';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { detectPlatform } from '@utils/browser';
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { Header } from './components/header';

interface TauriLayoutProps {
  isFileAccessApiSupported: boolean;
  isMobileDevice: boolean;
}

export function TauriLayout({ isFileAccessApiSupported }: TauriLayoutProps) {
  const { handleFileDrop } = useAddLocalFilesOrFolders();
  useMenuEvents(); // Handle menu events from Tauri
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.SIDEBAR_COLLAPSED);
    return stored ? JSON.parse(stored) : false;
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem(LOCAL_STORAGE_KEYS.SIDEBAR_COLLAPSED, JSON.stringify(newValue));
      return newValue;
    });
  };

  // Add padding for macOS traffic lights when using overlay titlebar
  // Default to 'darwin' if we're in Tauri since we're likely on macOS during development
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    // Detect platform for proper titlebar spacing
    try {
      const p = detectPlatform();
      setPlatform(p);
    } catch (err) {
      console.warn('Failed to detect platform:', err);
    }
  }, []);

  const isMacOS = platform === 'darwin';

  return isFileAccessApiSupported ? (
    <DndOverlay handleFileDrop={handleFileDrop}>
      <Stack gap={0} className="h-full" pos="relative" bg="background-primary">
        {/* Unified macOS toolbar - height matches native titlebar */}
        <header
          className={`flex-shrink-0 ${
            isMacOS
              ? 'h-[52px] bg-transparent border-b border-borderPrimary-light/30 dark:border-borderPrimary-dark/30'
              : 'h-[54px] border-b border-borderPrimary-light dark:border-borderPrimary-dark'
          }`}
          data-tauri-drag-region
        >
          <div className={`w-full h-full flex items-center ${isMacOS ? 'pb-[10px]' : ''}`}>
            {/* Fixed positioning for macOS traffic lights area and sidebar button */}
            {isMacOS ? (
              <div className="flex items-center" style={{ marginLeft: '80px' }}>
                <Tooltip
                  label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                  position="bottom"
                  openDelay={500}
                >
                  <ActionIcon size={28} variant="subtle" onClick={toggleSidebar} className="mr-4">
                    {sidebarCollapsed ? (
                      <IconLayoutSidebarLeftExpand size={18} />
                    ) : (
                      <IconLayoutSidebarLeftCollapse size={18} />
                    )}
                  </ActionIcon>
                </Tooltip>
              </div>
            ) : (
              <div className="ml-4">
                <Tooltip
                  label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                  position="bottom"
                  openDelay={500}
                >
                  <ActionIcon size={28} variant="subtle" onClick={toggleSidebar}>
                    {sidebarCollapsed ? (
                      <IconLayoutSidebarLeftExpand size={18} />
                    ) : (
                      <IconLayoutSidebarLeftCollapse size={18} />
                    )}
                  </ActionIcon>
                </Tooltip>
              </div>
            )}

            {/* Center container for search bar */}
            <div className="flex-1 flex items-center justify-center px-4">
              <Header />
            </div>

            {/* Right spacer */}
            <div className="w-[112px]" />
          </div>
        </header>

        {/* Pass sidebar state to child components via context or props */}
        <div className="flex-1 min-h-0">
          <Outlet context={{ sidebarCollapsed, toggleSidebar }} />
        </div>
      </Stack>
    </DndOverlay>
  ) : (
    <Outlet />
  );
}
