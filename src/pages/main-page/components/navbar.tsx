import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { DataExplorer } from '@features/data-explorer';
import { ScriptExplorer } from '@features/script-explorer';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { ActionIcon, Group, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { APP_GITHUB_URL } from '@models/app-urls';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { useAppStore } from '@store/app-store';
import {
  IconBrandGithub,
  IconFolderPlus,
  IconPlus,
  IconSettings,
  IconLayoutSidebarLeftCollapse,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { Allotment } from 'allotment';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  onCollapse?: () => void;
}

/**
 * Displays the navigation bar
 */
export const Navbar = ({ onCollapse }: NavbarProps) => {
  /**
   * Common hooks
   */
  const [navbarSizes, setInnerLayoutSizes] = useLocalStorage<number[]>({
    key: LOCAL_STORAGE_KEYS.NAVBAR_LAYOUT_DIMENSIONS,
  });

  const navigate = useNavigate();

  const appLoadState = useAppStore.use.appLoadState();

  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();

  /**
   * Local state
   */
  const appReady = appLoadState === 'ready';

  /**
   * Handlers
   */
  const handleNavbarLayoutResize = (sizes: number[]) => {
    setInnerLayoutSizes(sizes);
  };

  return (
    <Allotment vertical onDragEnd={handleNavbarLayoutResize}>
      <Allotment.Pane preferredSize={navbarSizes?.[0]} minSize={52}>
        <div className="h-full flex flex-col">
          <Group className="justify-between px-2 pt-4 pb-2" gap={0}>
            <Text size="sm" fw={500} c="text-primary">
              Data Explorer
            </Text>
            {appReady && (
              <Group justify="space-between">
                <Group className="gap-2">
                  <ActionIcon
                    onClick={handleAddFolder}
                    size={16}
                    key="Upload folder"
                    data-testid={setDataTestId('navbar-add-folder-button')}
                  >
                    <IconFolderPlus />
                  </ActionIcon>
                  <ActionIcon
                    onClick={() => handleAddFile()}
                    size={16}
                    key="Upload file"
                    data-testid={setDataTestId('navbar-add-file-button')}
                  >
                    <IconPlus />
                  </ActionIcon>
                </Group>
              </Group>
            )}
          </Group>

          {appReady ? (
            <DataExplorer />
          ) : (
            <Stack gap={6} className="px-3 py-1.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} height={13} width={Math.random() * 100 + 70} />
              ))}
            </Stack>
          )}
        </div>
      </Allotment.Pane>

      <Allotment.Pane preferredSize={navbarSizes?.[1]} minSize={52}>
        <Group className="gap-2 justify-between pl-4 px-2 pt-4 pb-2 h-[50px]">
          <Text size="sm" fw={500} className="" c="text-primary">
            Queries
          </Text>
          <Group className="gap-2">
            {appReady && (
              <ActionIcon
                data-testid={setDataTestId('script-explorer-add-script-button')}
                onClick={() => {
                  const newEmptyScript = createSQLScript();
                  getOrCreateTabFromScript(newEmptyScript, true);
                }}
                size={16}
                key="Add query"
              >
                <IconPlus />
              </ActionIcon>
            )}
          </Group>
        </Group>
        {appReady ? (
          <ScriptExplorer />
        ) : (
          <Stack gap={6} className="px-3 py-1.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={13} width={Math.random() * 100 + 70} />
            ))}
          </Stack>
        )}
      </Allotment.Pane>
      <Allotment.Pane maxSize={34} minSize={34}>
        <div className="h-full px-3 flex items-center justify-between">
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
        </div>
      </Allotment.Pane>
    </Allotment>
  );
};

Navbar.displayName = 'Navbar';
