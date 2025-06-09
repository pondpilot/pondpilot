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
  IconChevronDown,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  onCollapse?: () => void;
}

type SectionState = {
  dataExplorer: boolean;
  queries: boolean;
};

/**
 * Accordion-style navigation bar with collapsible sections
 */
export const AccordionNavbar = ({ onCollapse }: NavbarProps) => {
  const navigate = useNavigate();
  const appLoadState = useAppStore.use.appLoadState();
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();

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

  // Save state changes to localStorage
  useEffect(() => {
    localStorage.setItem('accordion-navbar-sections', JSON.stringify(sectionStates));
  }, [sectionStates]);

  const appReady = appLoadState === 'ready';

  const toggleSection = (section: keyof SectionState) => {
    setSectionStates((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Calculate flex grow for expanded sections
  const expandedCount = Object.values(sectionStates).filter(Boolean).length;
  const flexGrow = expandedCount === 2 ? 1 : expandedCount === 1 ? 1 : 0;

  return (
    <Stack className="h-full" gap={0}>
      {/* Data Explorer Section */}
      <Box
        className={cn(
          'border-b border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col overflow-hidden',
          sectionStates.dataExplorer && 'flex-1',
        )}
        style={{
          flexGrow: sectionStates.dataExplorer ? flexGrow : 0,
          minHeight: sectionStates.dataExplorer ? 200 : 36,
          maxHeight: sectionStates.dataExplorer ? '100%' : 36,
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
          {appReady && sectionStates.dataExplorer && (
            <Group gap={8} onClick={(e) => e.stopPropagation()}>
              <ActionIcon
                onClick={handleAddFolder}
                size={16}
                data-testid={setDataTestId('navbar-add-folder-button')}
              >
                <IconFolderPlus />
              </ActionIcon>
              <ActionIcon
                onClick={() => handleAddFile()}
                size={16}
                data-testid={setDataTestId('navbar-add-file-button')}
              >
                <IconPlus />
              </ActionIcon>
            </Group>
          )}
        </Group>

        {sectionStates.dataExplorer && (
          <Box className="overflow-hidden flex flex-col flex-1">
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
        )}
      </Box>

      {/* Queries Section */}
      <Box
        className={cn(
          'border-b border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col overflow-hidden',
          sectionStates.queries && 'flex-1',
        )}
        style={{
          flexGrow: sectionStates.queries ? flexGrow : 0,
          minHeight: sectionStates.queries ? 200 : 36,
          maxHeight: sectionStates.queries ? '100%' : 36,
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
          {appReady && sectionStates.queries && (
            <ActionIcon
              data-testid={setDataTestId('script-explorer-add-script-button')}
              onClick={(e) => {
                e.stopPropagation();
                const newEmptyScript = createSQLScript();
                getOrCreateTabFromScript(newEmptyScript, true);
              }}
              size={16}
            >
              <IconPlus />
            </ActionIcon>
          )}
        </Group>

        {sectionStates.queries && (
          <Box className="overflow-hidden flex flex-col flex-1">
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
        )}
      </Box>

      {/* Bottom toolbar */}
      <Box className="mt-auto h-[34px] px-3 flex items-center justify-between">
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
          <Tooltip label="Collapse sidebar" position="top" withArrow>
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
