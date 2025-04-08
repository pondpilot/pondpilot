import { SettingsModal } from '@components/settings-modal';
import { DbExplorer } from '@features/db-explorer/db-explorer';
import { QueryExplorer } from '@features/query-explorer';
import { ViewExplorer } from '@features/view-explorer';
import { ActionIcon, Button, Divider, Group, Text } from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import { IconBrandGithub, IconPlus, IconSettings } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { Allotment } from 'allotment';
import { useFileHandlers } from '@hooks/useUploadFilesHandlers';
import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setDataTestId } from '@utils/test-id';

/**
 * Displays the navigation bar
 */
export const Navbar = memo(() => {
  /**
   * Common hooks
   */
  const [navbarSizes, setInnerLayoutSizes] = useLocalStorage<number[]>({ key: 'navbar-sizes' });
  const [settingsOpened, { close: closeSettings }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const { handleAddSource } = useFileHandlers();
  const navigate = useNavigate();

  /**
   * Local state
   */
  const [viewsDbToggle, setViewsDbToggle] = useState<'views' | 'databases'>('views');
  const isViews = viewsDbToggle === 'views';

  /**
   * Handlers
   */
  const handleNavbarLayoutResize = (sizes: number[]) => {
    setInnerLayoutSizes(sizes);
  };

  return (
    <>
      <SettingsModal
        opened={settingsOpened}
        onClose={closeSettings}
        confirmOpened={confirmOpened}
        onConfirmOpen={openConfirm}
        onConfirmClose={closeConfirm}
      />
      <Allotment vertical onDragEnd={handleNavbarLayoutResize}>
        <Allotment.Pane preferredSize={navbarSizes?.[0]} minSize={52}>
          <Group className="justify-between px-2 pt-4 pb-2" gap={0}>
            <Group gap={0}>
              <Button
                variant="transparent"
                color="text-primary"
                bg={isViews ? 'background-secondary' : undefined}
                fw={500}
                className={cn(
                  'text-textPrimary-light dark:text-textPrimary-dark ',
                  !isViews && 'text-textSecondary-light dark:text-textSecondary-dark',
                )}
                onClick={() => setViewsDbToggle('views')}
              >
                Files
              </Button>
              <Button
                variant="transparent"
                color="text-primary"
                onClick={() => setViewsDbToggle('databases')}
                bg={!isViews ? 'background-secondary' : undefined}
                fw={500}
                className={cn(
                  'text-textPrimary-light dark:text-textPrimary-dark',
                  isViews && 'text-textSecondary-light dark:text-textSecondary-dark',
                )}
              >
                Databases
              </Button>
            </Group>
            <Group justify="space-between">
              <Group className="gap-2">
                <Divider orientation="vertical" />
                <ActionIcon
                  onClick={handleAddSource('file', ['.parquet', '.csv', '.json', '.duckdb'])}
                  size={16}
                  key="Upload file"
                  data-testid={setDataTestId('add-file-button')}
                >
                  <IconPlus />
                </ActionIcon>
              </Group>
            </Group>
          </Group>

          {isViews ? <ViewExplorer /> : <DbExplorer />}
        </Allotment.Pane>

        <Allotment.Pane preferredSize={navbarSizes?.[1]} minSize={52}>
          <QueryExplorer />
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
                href="https://github.com/pondpilot/pondpilot"
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
    </>
  );
});

Navbar.displayName = 'Navbar';
