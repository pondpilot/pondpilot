import { DndOverlay } from '@components/dnd-overlay';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { Stack, ActionIcon, Tooltip } from '@mantine/core';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { Header } from './components/header';

interface TauriLayoutProps {
  isFileAccessApiSupported: boolean;
  isMobileDevice: boolean;
}

export function TauriLayout({ isFileAccessApiSupported }: TauriLayoutProps) {
  const { handleFileDrop } = useAddLocalFilesOrFolders();
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
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    // Detect platform for proper titlebar spacing
    const detectPlatform = async () => {
      try {
        // Dynamically import Tauri modules only when in Tauri environment
        if (window.__TAURI__) {
          const { os } = window.__TAURI__;
          if (os && os.platform) {
            const platform = await os.platform();
            setPlatform(platform);
          }
        }
      } catch (err) {
        console.warn('Failed to detect platform:', err);
      }
    };
    detectPlatform();
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
        >
          <div 
            className="w-full h-full flex items-center relative"
            style={{
              WebkitAppRegion: 'drag',
            } as React.CSSProperties}
          >
            {/* Left section with traffic lights space and sidebar button */}
            <div className="flex items-center flex-shrink-0">
              {/* Space for traffic lights - increased to avoid overlap */}
              {isMacOS && <div className="w-[80px]" />}
              
              {/* Sidebar button - NOT draggable */}
              <div 
                style={{
                  WebkitAppRegion: 'no-drag',
                } as React.CSSProperties}
              >
                <Tooltip
                  label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                  position="bottom"
                  openDelay={500}
                >
                  <ActionIcon
                    size={28}
                    variant="subtle"
                    onClick={toggleSidebar}
                    className={isMacOS ? 'ml-1' : 'ml-4'}
                  >
                    {sidebarCollapsed ? (
                      <IconLayoutSidebarLeftExpand size={18} />
                    ) : (
                      <IconLayoutSidebarLeftCollapse size={18} />
                    )}
                  </ActionIcon>
                </Tooltip>
              </div>
            </div>

            {/* Center container for search bar */}
            <div 
              className="flex-1 flex items-center justify-center px-4 pt-1"
              style={{
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties}
            >
              <Header />
            </div>

            {/* Right spacer for balance - adjusted to match left side */}
            <div className="w-[109px] flex-shrink-0" />
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
