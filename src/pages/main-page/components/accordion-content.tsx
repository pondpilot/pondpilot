import { aiChatController } from '@controllers/ai-chat';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript, getOrCreateTabFromConversation, createComparisonTab } from '@controllers/tab';
import { DataExplorer } from '@features/data-explorer';
import { useOpenDataWizardModal } from '@features/datasource-wizard/utils';
import { ScriptExplorer } from '@features/script-explorer';
import { ActionIcon, Group, Skeleton, Stack, Text, Box } from '@mantine/core';
import { useAppStore } from '@store/app-store';
import { IconPlus, IconChevronDown, IconScale, IconMessageCircle } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { useState, useEffect, useRef, useCallback } from 'react';

type SectionState = {
  dataExplorer: boolean;
  queries: boolean;
};

/**
 * Accordion content component with Data Explorer and Queries sections
 */
export const AccordionContent = () => {
  const appLoadState = useAppStore.use.appLoadState();
  const { openDataWizardModal } = useOpenDataWizardModal();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dataExplorerHeight, setDataExplorerHeight] = useState<number | null>(null);
  const resizeStartRef = useRef<{ initialHeight: number; startY: number } | null>(null);

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
  const bothExpanded = sectionStates.dataExplorer && sectionStates.queries;

  const toggleSection = (section: keyof SectionState) => {
    setSectionStates((prev) => {
      const newState = {
        ...prev,
        [section]: !prev[section],
      };

      // When transitioning from one section expanded to both expanded
      if (newState.dataExplorer && newState.queries && !bothExpanded) {
        if (containerRef.current) {
          const containerHeight = containerRef.current.clientHeight;
          const headerHeight = 36; // px
          const availableHeight = containerHeight - headerHeight * 2 - 1; // -1 for resize handle
          // Set data explorer to 50% of available space by default
          setDataExplorerHeight(Math.max(100, Math.floor(availableHeight / 2)));
        } else {
          setDataExplorerHeight(null);
        }
      } else if (section === 'queries' && !newState.queries) {
        // Collapsing the queries section - expand DataExplorer to fill the space
        if (containerRef.current && dataExplorerHeight) {
          const containerHeight = containerRef.current.clientHeight;
          const collapsedQueriesHeight = 36; // px - only header when collapsed
          // DataExplorer should take all space except collapsed Queries
          const finalHeight = Math.max(100, containerHeight - collapsedQueriesHeight);
          setDataExplorerHeight(finalHeight);
          // No setTimeout - keep the fixed height to avoid jump
        } else {
          setDataExplorerHeight(null);
        }
      } else if (section === 'dataExplorer' && !newState.dataExplorer) {
        // Collapsing the data explorer section - reset height immediately since it's not visible
        setDataExplorerHeight(null);
      }

      return newState;
    });
  };

  // Handle resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const currentHeight = dataExplorerHeight || (containerRect.height - 36 - 36) / 2;

      resizeStartRef.current = {
        initialHeight: currentHeight,
        startY: e.clientY,
      };

      setIsResizing(true);
    },
    [dataExplorerHeight],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current || !resizeStartRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const { initialHeight, startY } = resizeStartRef.current;

      // Calculate new height based on mouse movement from the initial start position
      const mouseDelta = e.clientY - startY;
      const newHeight = initialHeight + mouseDelta;
      const minHeight = 100;
      // Reserve minimum space for Queries section (100px + 36px header = 136px)
      const maxHeight = containerRect.height - 36 - 36 - 136; // headers + min queries space

      setDataExplorerHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    resizeStartRef.current = null;
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

  // Reset dataExplorerHeight only when DataExplorer is closed
  useEffect(() => {
    if (!sectionStates.dataExplorer && dataExplorerHeight) {
      setDataExplorerHeight(null);
    }
  }, [sectionStates.dataExplorer, dataExplorerHeight]);

  return (
    <Stack className="h-full" gap={0} ref={containerRef}>
      {/* Data Explorer Section */}
      <Box
        className={cn(
          'border-b border-borderPrimary-light dark:border-borderPrimary-dark flex flex-col overflow-hidden',
          // Only apply transitions when not resizing - use specific properties
          !isResizing && 'transition-[flex-basis,min-height] duration-300 ease-out',
        )}
        style={{
          flex: sectionStates.dataExplorer
            ? dataExplorerHeight
              ? `0 0 ${dataExplorerHeight}px`
              : '1 1 auto'
            : '0 0 36px',
          minHeight: sectionStates.dataExplorer ? 100 : 36,
          // Ensure smooth transitions
          transitionProperty: isResizing ? 'none' : 'flex-basis, min-height',
        }}
      >
        <Group
          className="justify-between px-2 py-1.5 cursor-pointer hover:bg-transparent008-light dark:hover:bg-transparent008-dark select-none"
          gap={0}
          onClick={() => toggleSection('dataExplorer')}
        >
          <Group gap={4}>
            <div className="text-textTertiary-light dark:text-textTertiary-dark transition-transform duration-200">
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
            <ActionIcon
              onClick={(e) => {
                e.stopPropagation();
                openDataWizardModal('selection');
                if (!sectionStates.dataExplorer) {
                  setSectionStates((prev) => ({ ...prev, dataExplorer: true }));
                }
              }}
              size={16}
              data-testid={setDataTestId('navbar-add-datasource-button')}
            >
              <IconPlus />
            </ActionIcon>
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
          className="h-[1px] bg-borderPrimary-light dark:bg-borderPrimary-dark relative cursor-ns-resize w-full border-none outline-none"
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
                // Reserve minimum space for Queries section (100px + 36px header = 136px)
                const maxHeight = containerRect.height - 36 - 36 - 136;
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
          // Apply transitions when not resizing - use specific properties
          !isResizing && 'transition-[flex-basis,min-height] duration-300 ease-out',
          // Only add border when collapsed AND data explorer is also collapsed
          !sectionStates.queries &&
            !sectionStates.dataExplorer &&
            'border-b border-borderPrimary-light dark:border-borderPrimary-dark',
        )}
        style={{
          flex: sectionStates.queries ? '1 1 auto' : '0 0 36px',
          minHeight: sectionStates.queries ? 100 : 36,
          // Ensure smooth transitions (disable only during active resizing)
          transitionProperty: isResizing ? 'none' : 'flex-basis, min-height',
        }}
      >
        <Group
          className="justify-between px-2 py-1.5 cursor-pointer hover:bg-transparent008-light dark:hover:bg-transparent008-dark select-none"
          gap={0}
          onClick={() => toggleSection('queries')}
        >
          <Group gap={4}>
            <div className="text-textTertiary-light dark:text-textTertiary-dark transition-transform duration-200">
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
            <Group gap={4}>
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
                title="New Script"
                aria-label="Create new script"
              >
                <IconPlus />
              </ActionIcon>
              <ActionIcon
                data-testid={setDataTestId('create-comparison-tab-button')}
                onClick={(e) => {
                  e.stopPropagation();
                  createComparisonTab({ setActive: true });
                }}
                size={16}
                title="Compare Datasets"
                aria-label="Create comparison tab"
              >
                <IconScale />
              </ActionIcon>
              <ActionIcon
                data-testid={setDataTestId('create-ai-chat-button')}
                onClick={(e) => {
                  e.stopPropagation();
                  const newConversation = aiChatController.createConversation();
                  getOrCreateTabFromConversation(newConversation.id, true);
                  if (!sectionStates.queries) {
                    setSectionStates((prev) => ({ ...prev, queries: true }));
                  }
                }}
                size={16}
                title="New AI Chat"
                aria-label="Create new AI chat"
              >
                <IconMessageCircle />
              </ActionIcon>
            </Group>
          )}
        </Group>

        <Box
          className="overflow-hidden flex flex-col flex-1"
          style={{
            opacity: sectionStates.queries ? 1 : 0,
            transition: 'opacity 200ms',
            maxHeight: sectionStates.queries ? 'calc(100% - 36px)' : undefined, // Subtract header height
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
    </Stack>
  );
};

AccordionContent.displayName = 'AccordionContent';
