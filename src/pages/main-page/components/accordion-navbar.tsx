import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { DataExplorer } from '@features/data-explorer';
import { ScriptExplorer } from '@features/script-explorer';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { ActionIcon, Group, Skeleton, Stack, Text, Tooltip, Box } from '@mantine/core';
import { APP_GITHUB_URL } from '@models/app-urls';
import { useAppStore } from '@store/app-store';
import {
  IconBrandGithub,
  IconFolderPlus,
  IconPlus,
  IconSettings,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightCollapse,
  IconChevronDown,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  onCollapse?: () => void;
  collapsed?: boolean;
}

type SectionState = {
  dataExplorer: boolean;
  queries: boolean;
};

/**
 * Accordion-style navigation bar with collapsible sections
 */
export const AccordionNavbar = ({ onCollapse, collapsed = false }: NavbarProps) => {
  const navigate = useNavigate();
  const appLoadState = useAppStore.use.appLoadState();
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dataExplorerHeight, setDataExplorerHeight] = useState<number | null>(null);

  // Load saved section states or default to both expanded
  const [sectionStates, setSectionStates] = useState<SectionState>(() => {
    const saved = localStorage.getItem('accordion-navbar-sections');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved section states:', e);
      }
    }
    return {
      dataExplorer: true,
      queries: true,
    };
  });

  // Load saved height
  useEffect(() => {
    const savedHeight = localStorage.getItem('accordion-data-explorer-height');
    if (savedHeight) {
      setDataExplorerHeight(parseInt(savedHeight, 10));
    }
  }, []);

  // Save state changes to localStorage
  useEffect(() => {
    localStorage.setItem('accordion-navbar-sections', JSON.stringify(sectionStates));
  }, [sectionStates]);

  // Save height to localStorage
  useEffect(() => {
    if (dataExplorerHeight !== null) {
      localStorage.setItem('accordion-data-explorer-height', dataExplorerHeight.toString());
    }
  }, [dataExplorerHeight]);

  const appReady = appLoadState === 'ready';

  // Calculate if both are expanded before toggle section
  const bothExpanded = sectionStates.dataExplorer && sectionStates.queries;

  const toggleSection = (section: keyof SectionState) => {
    setSectionStates((prev) => {
      const newState = {
        ...prev,
        [section]: !prev[section],
      };

      // When transitioning from one section expanded to both expanded
      if (newState.dataExplorer && newState.queries && !bothExpanded) {
        // If expanding from only one section to both, set a reasonable default height
        // This prevents the data explorer from taking all available space
        if (containerRef.current) {
          const containerHeight = containerRef.current.clientHeight;
          const headerHeight = 36; // px
          const footerHeight = 34; // px
          const availableHeight = containerHeight - headerHeight * 2 - footerHeight - 1; // -1 for resize handle
          // Set data explorer to 50% of available space by default
          setDataExplorerHeight(Math.max(100, Math.floor(availableHeight / 2)));
        } else {
          setDataExplorerHeight(null);
        }
      } else if (section === 'queries' && !newState.queries) {
        // Collapsing the queries section
        setDataExplorerHeight(null);
      }

      return newState;
    });
  };

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = e.clientY - containerRect.top - 36; // 36px is the header height
      const minHeight = 100;
      const maxHeight = containerRect.height - 36 - 36 - 34; // headers + footer

      setDataExplorerHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Render compact view when collapsed
  if (collapsed) {
    return (
      <Stack className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark" gap={0}>
        {/* Create New Query button */}
        <Box className="p-2 border-b border-gray-200 dark:border-gray-700">
          <Tooltip label="Create new query" position="right" withArrow openDelay={500}>
            <ActionIcon
              size="lg"
              variant="subtle"
              className="w-full"
              data-testid={setDataTestId('collapsed-new-query-button')}
              onClick={() => {
                const newEmptyScript = createSQLScript();
                getOrCreateTabFromScript(newEmptyScript, true);
              }}
            >
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Box>

        {/* Bottom toolbar */}
        <Box className="mt-auto border-t border-gray-200 dark:border-gray-700 p-2">
          <Stack gap="xs">
            <Tooltip label="Settings" position="right" withArrow openDelay={500}>
              <ActionIcon
                size="lg"
                variant="subtle"
                className="w-full"
                data-testid={setDataTestId('settings-button')}
                onClick={() => navigate('/settings')}
              >
                <IconSettings size={20} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="GitHub" position="right" withArrow openDelay={500}>
              <ActionIcon
                size="lg"
                variant="subtle"
                className="w-full"
                component="a"
                href={APP_GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconBrandGithub size={20} />
              </ActionIcon>
            </Tooltip>
            {onCollapse && (
              <Tooltip label="Expand sidebar" position="right" withArrow openDelay={500}>
                <ActionIcon
                  size="lg"
                  variant="subtle"
                  className="w-full"
                  data-testid={setDataTestId('expand-sidebar-button')}
                  onClick={onCollapse}
                >
                  <IconLayoutSidebarRightCollapse size={20} />
                </ActionIcon>
              </Tooltip>
            )}
          </Stack>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack
      className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark"
      gap={0}
      ref={containerRef}
    >
      {/* Data Explorer Section */}
      <Box
        className={cn(
          'border-b border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden',
        )}
        style={{
          flex: sectionStates.dataExplorer
            ? dataExplorerHeight && bothExpanded
              ? `0 0 ${dataExplorerHeight}px`
              : '1 1 auto'
            : '0 0 36px',
          minHeight: sectionStates.dataExplorer ? 100 : 36,
        }}
      >
        <Group
          className="justify-between px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
          gap={0}
          onClick={() => toggleSection('dataExplorer')}
        >
          <Group gap={4}>
            <div className="text-gray-500 dark:text-gray-400 transition-transform duration-200">
              <IconChevronDown
                size={16}
                style={{
                  transform: sectionStates.dataExplorer ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              />
            </div>
            <Text size="sm" fw={500} c="text-primary">
              Data Explorer
            </Text>
          </Group>
          {appReady && (
            <Group gap={8} onClick={(e) => e.stopPropagation()}>
              <ActionIcon
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddFolder();
                  if (!sectionStates.dataExplorer) {
                    setSectionStates((prev) => ({ ...prev, dataExplorer: true }));
                  }
                }}
                size={16}
                data-testid={setDataTestId('navbar-add-folder-button')}
              >
                <IconFolderPlus />
              </ActionIcon>
              <ActionIcon
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddFile();
                  if (!sectionStates.dataExplorer) {
                    setSectionStates((prev) => ({ ...prev, dataExplorer: true }));
                  }
                }}
                size={16}
                data-testid={setDataTestId('navbar-add-file-button')}
              >
                <IconPlus />
              </ActionIcon>
            </Group>
          )}
        </Group>

        <Box
          className="overflow-hidden flex flex-col flex-1"
          style={{
            opacity: sectionStates.dataExplorer ? 1 : 0,
            transition: 'opacity 200ms',
          }}
        >
          {appReady ? (
            <DataExplorer />
          ) : (
            <Stack gap={6} className="px-3 py-1.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} height={13} width={Math.random() * 100 + 70} />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Resize Handle */}
      {bothExpanded && (
        <button
          type="button"
          aria-label="Resize handle - use arrow keys to adjust"
          className={cn(
            'h-[1px] bg-gray-200 dark:bg-gray-700 relative cursor-ns-resize hover:bg-blue-500 w-full border-none outline-none focus:bg-blue-500',
            isResizing && 'bg-blue-500',
          )}
          onMouseDown={handleMouseDown}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const currentHeight = dataExplorerHeight || 200;
              setDataExplorerHeight(Math.max(100, currentHeight - 10));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const currentHeight = dataExplorerHeight || 200;
              if (containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const maxHeight = containerRect.height - 36 - 36 - 34;
                setDataExplorerHeight(Math.min(maxHeight, currentHeight + 10));
              }
            }
          }}
        >
          {/* Invisible hit area for easier grabbing */}
          <div className="absolute inset-x-0 -top-2 -bottom-2" />
        </button>
      )}

      {/* Queries Section */}
      <Box
        className={cn(
          'flex flex-col overflow-hidden',
          !isResizing && 'transition-all duration-300',
          // Only add border when collapsed AND data explorer is also collapsed
          !sectionStates.queries &&
            !sectionStates.dataExplorer &&
            'border-b border-gray-200 dark:border-gray-700',
        )}
        style={{
          flex: sectionStates.queries ? '1 1 auto' : '0 0 36px',
          minHeight: sectionStates.queries ? 100 : 36,
        }}
      >
        <Group
          className="justify-between px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
          gap={0}
          onClick={() => toggleSection('queries')}
        >
          <Group gap={4}>
            <div className="text-gray-500 dark:text-gray-400 transition-transform duration-200">
              <IconChevronDown
                size={16}
                style={{
                  transform: sectionStates.queries ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              />
            </div>
            <Text size="sm" fw={500} c="text-primary">
              Queries
            </Text>
          </Group>
          {appReady && (
            <ActionIcon
              data-testid={setDataTestId('script-explorer-add-script-button')}
              onClick={(e) => {
                e.stopPropagation();
                const newEmptyScript = createSQLScript();
                getOrCreateTabFromScript(newEmptyScript, true);
                if (!sectionStates.queries) {
                  setSectionStates((prev) => ({ ...prev, queries: true }));
                }
              }}
              size={16}
            >
              <IconPlus />
            </ActionIcon>
          )}
        </Group>

        <Box
          className="overflow-hidden flex flex-col flex-1"
          style={{
            opacity: sectionStates.queries ? 1 : 0,
            transition: 'opacity 200ms',
          }}
        >
          {appReady ? (
            <ScriptExplorer />
          ) : (
            <Stack gap={6} className="px-3 py-1.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} height={13} width={Math.random() * 100 + 70} />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Bottom toolbar */}
      <Box className="mt-auto h-[34px] px-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
        <Group gap="xs">
          <ActionIcon
            size={20}
            data-testid={setDataTestId('settings-button')}
            onClick={() => navigate('/settings')}
          >
            <IconSettings />
          </ActionIcon>
          <ActionIcon
            size={20}
            component="a"
            href={APP_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconBrandGithub />
          </ActionIcon>
        </Group>
        {onCollapse && (
          <Tooltip label="Collapse sidebar" position="top" withArrow openDelay={500}>
            <ActionIcon
              size={20}
              data-testid={setDataTestId('collapse-sidebar-button')}
              onClick={onCollapse}
              variant="subtle"
            >
              <IconLayoutSidebarLeftCollapse />
            </ActionIcon>
          </Tooltip>
        )}
      </Box>
    </Stack>
  );
};

AccordionNavbar.displayName = 'AccordionNavbar';
