import { DbExplorer } from '@features/db-explorer/db-explorer';
import { ScriptExplorer } from '@features/script-explorer';
import { FileSystemExplorer } from '@features/file-system-explorer';
import { ActionIcon, Button, Divider, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconBrandGithub, IconPlus, IconSettings } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { Allotment } from 'allotment';
import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setDataTestId } from '@utils/test-id';
import { APP_GITHUB_URL } from 'app-urls';
import { createSQLScript, getOrCreateTabFromScript, useInitStore } from '@store/init-store';
import { useLocalFilesOrFolders } from '@hooks/useLocalFilesOrFolders';

/**
 * Displays the navigation bar
 */
export const Navbar = memo(() => {
  /**
   * Common hooks
   */
  const [navbarSizes, setInnerLayoutSizes] = useLocalStorage<number[]>({ key: 'navbar-sizes' });
  const navigate = useNavigate();

  const appLoadState = useInitStore.use.appLoadState();

  const { handleAddFile } = useLocalFilesOrFolders();

  /**
   * Local state
   */
  const [filesDbToggle, setFilesDbToggle] = useState<'files' | 'databases'>('files');
  const isFiles = filesDbToggle === 'files';
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
        <Group className="justify-between px-2 pt-4 pb-2" gap={0}>
          <Group gap={0}>
            <Button
              variant="transparent"
              color="text-primary"
              bg={isFiles ? 'background-secondary' : undefined}
              fw={500}
              className={cn(
                'text-textPrimary-light dark:text-textPrimary-dark ',
                !isFiles && 'text-textSecondary-light dark:text-textSecondary-dark',
              )}
              onClick={() => setFilesDbToggle('files')}
            >
              Files
            </Button>
            <Button
              variant="transparent"
              color="text-primary"
              onClick={() => setFilesDbToggle('databases')}
              bg={!isFiles ? 'background-secondary' : undefined}
              fw={500}
              className={cn(
                'text-textPrimary-light dark:text-textPrimary-dark',
                isFiles && 'text-textSecondary-light dark:text-textSecondary-dark',
              )}
            >
              Databases
            </Button>
          </Group>
          {appReady && (
            <Group justify="space-between">
              <Group className="gap-2">
                <Divider orientation="vertical" />
                <ActionIcon
                  onClick={() => handleAddFile()}
                  size={16}
                  key="Upload file"
                  data-testid={setDataTestId('add-file-button')}
                >
                  <IconPlus />
                </ActionIcon>
              </Group>
            </Group>
          )}
        </Group>

        {appReady ? (
          isFiles ? (
            <FileSystemExplorer />
          ) : (
            <DbExplorer />
          )
        ) : (
          <Stack gap={6} className="px-3 py-1.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={13} width={Math.random() * 100 + 70} />
            ))}
          </Stack>
        )}
      </Allotment.Pane>

      <Allotment.Pane preferredSize={navbarSizes?.[1]} minSize={52}>
        <Group className="gap-2 justify-between pl-4 px-2 pt-4 pb-2 h-[50px]">
          <Text size="sm" fw={500} className="" c="text-primary">
            Queries
          </Text>
          <Group className="gap-2">
            <Divider orientation="vertical" />
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
        <Group className="h-full px-3 justify-between">
          <Group>
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
          <Text c="text-secondary" maw={100} truncate="end">
            {__VERSION__}
          </Text>
        </Group>
      </Allotment.Pane>
    </Allotment>
  );
});

Navbar.displayName = 'Navbar';
