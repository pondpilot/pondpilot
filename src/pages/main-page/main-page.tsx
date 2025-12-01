import { BrowserCompatibilityAlert } from '@components/browser-compatibility-alert';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { createComparisonTab } from '@controllers/tab/comparison-tab-controller';
import { StartGuide } from '@features/start-guide';
import { TabView } from '@features/tab-view/tab-view';
import { TabsPane } from '@features/tabs-pane';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useAppTheme } from '@hooks/use-app-theme';
import { useIsTauri } from '@hooks/use-is-tauri';
import { Stack } from '@mantine/core';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { useAppStore } from '@store/app-store';
import { importSQLFiles } from '@utils/import-script-file';
import { Allotment } from 'allotment';
import { useCallback, useRef, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

import { AccordionNavbar } from './components';
import './main-page.css';

interface OutletContext {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();
  const colorScheme = useAppTheme();
  const isTauri = useIsTauri();
  const [layoutSizes, setOuterLayoutSizes] = useLocalStorage<number[]>({
    key: LOCAL_STORAGE_KEYS.MAIN_LAYOUT_DIMENSIONS,
  });

  // Get sidebar state from Tauri layout context if available
  // Always call the hook to maintain consistent hook order
  const outletContext = useOutletContext<OutletContext | undefined>();
  const tauriContext = isTauri ? outletContext : undefined;

  const [localSidebarCollapsed, setLocalSidebarCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.SIDEBAR_COLLAPSED);
    return stored ? JSON.parse(stored) : false;
  });

  // Use Tauri context if available, otherwise use local state
  const sidebarCollapsed = tauriContext?.sidebarCollapsed ?? localSidebarCollapsed;
  const setSidebarCollapsed = tauriContext
    ? (value: boolean | ((prev: boolean) => boolean)) => {
        // For Tauri, use the toggle function from context
        if (typeof value === 'function') {
          tauriContext.toggleSidebar();
        } else if (value !== tauriContext.sidebarCollapsed) {
          // If value doesn't match current state, toggle
          tauriContext.toggleSidebar();
        }
      }
    : setLocalSidebarCollapsed;

  const tabCount = useAppStore((state) => state.tabs.size);
  const hasTabs = tabCount > 0;
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDraggingRef = useRef(false);
  const mouseXRef = useRef(0);

  const handleAddScript = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  /**
   * Handlers
   */
  const handleOuterLayoutResize = useCallback(
    (sizes: number[]) => {
      setOuterLayoutSizes(sizes);

      // Auto-collapse logic - if sidebar is dragged to very small size and held there
      if (!sidebarCollapsed && sizes[0] <= 200 && isDraggingRef.current) {
        if (mouseXRef.current < 200) {
          if (!collapseTimeoutRef.current) {
            collapseTimeoutRef.current = setTimeout(() => {
              setSidebarCollapsed((_prev) => {
                const newValue = true;
                localStorage.setItem(
                  LOCAL_STORAGE_KEYS.SIDEBAR_COLLAPSED,
                  JSON.stringify(newValue),
                );
                return newValue;
              });
              collapseTimeoutRef.current = null;
            }, 300);
          }
        } else if (collapseTimeoutRef.current) {
          clearTimeout(collapseTimeoutRef.current);
          collapseTimeoutRef.current = null;
        }
      } else if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
    },
    [sidebarCollapsed, setOuterLayoutSizes],
  );

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    // Clear any existing timeout when starting a new drag
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    // Clear timeout on drag end
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem(LOCAL_STORAGE_KEYS.SIDEBAR_COLLAPSED, JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseXRef.current = e.clientX;
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useHotkeys([
    [
      'Ctrl+F',
      () => {
        handleAddFile();
        Spotlight.close();
      },
    ],
    [
      'Ctrl+D',
      () => {
        handleAddFile();
        Spotlight.close();
      },
    ],
    [
      'Ctrl+I',
      () => {
        importSQLFiles();
        Spotlight.close();
      },
    ],
    [
      'Alt+mod+F',
      () => {
        handleAddFolder();
        Spotlight.close();
      },
    ],
    [
      'Ctrl+Alt+N',
      () => {
        handleAddScript();
        Spotlight.close();
      },
    ],
    [
      'Ctrl+Alt+C',
      () => {
        createComparisonTab({ setActive: true });
        Spotlight.close();
      },
    ],
  ]);

  const mainContent = (
    <>
      {hasTabs && (
        <Stack className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark gap-0 border-l border-borderPrimary-light dark:border-borderPrimary-dark">
          <div className="flex-shrink-0">
            <TabsPane />
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <BrowserCompatibilityAlert />
            <TabView />
          </div>
        </Stack>
      )}

      {!hasTabs && (
        <div className="h-full border-l border-borderPrimary-light dark:border-borderPrimary-dark">
          <BrowserCompatibilityAlert />
          <StartGuide />
        </div>
      )}
    </>
  );

  return (
    <Allotment
      className={colorScheme === 'dark' ? 'custom-allotment-dark' : 'custom-allotment'}
      onChange={handleOuterLayoutResize}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Allotment.Pane
        preferredSize={sidebarCollapsed ? 56 : layoutSizes?.[0] || 280}
        maxSize={sidebarCollapsed ? 56 : 400}
        minSize={sidebarCollapsed ? 56 : 200}
      >
        <AccordionNavbar onCollapse={toggleSidebar} collapsed={sidebarCollapsed} />
      </Allotment.Pane>
      <Allotment.Pane preferredSize={layoutSizes?.[1]}>{mainContent}</Allotment.Pane>
    </Allotment>
  );
};
