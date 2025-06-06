import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { ActionIcon, Stack, Tooltip } from '@mantine/core';
import { APP_GITHUB_URL } from '@models/app-urls';
import { useAppStore } from '@store/app-store';
import {
  IconSettings,
  IconBrandGithub,
  IconFilePlus,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useNavigate } from 'react-router-dom';

interface CollapsedNavbarProps {
  onExpand: () => void;
}

/**
 * Displays the collapsed navigation bar with icons only
 */
export const CollapsedNavbar = ({ onExpand }: CollapsedNavbarProps) => {
  const navigate = useNavigate();
  const appLoadState = useAppStore.use.appLoadState();
  const appReady = appLoadState === 'ready';

  return (
    <Stack className="h-full bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark" gap={0}>
      {/* Top Section - Only New Query */}
      <Stack
        gap="xs"
        className="p-2 border-b border-borderPrimary-light dark:border-borderPrimary-dark"
      >
        {appReady && (
          <Tooltip label="New Query" position="right" withArrow>
            <ActionIcon
              size="lg"
              variant="subtle"
              onClick={() => {
                const newEmptyScript = createSQLScript();
                getOrCreateTabFromScript(newEmptyScript, true);
              }}
              data-testid={setDataTestId('collapsed-navbar-add-query')}
            >
              <IconFilePlus size={20} />
            </ActionIcon>
          </Tooltip>
        )}
      </Stack>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom Section */}
      <Stack
        gap="xs"
        className="p-2 border-t border-borderPrimary-light dark:border-borderPrimary-dark"
      >
        <Tooltip label="Settings" position="right" withArrow>
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={() => navigate('/settings')}
            data-testid={setDataTestId('collapsed-navbar-settings')}
          >
            <IconSettings size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="GitHub" position="right" withArrow>
          <ActionIcon
            size="lg"
            variant="subtle"
            component="a"
            href={APP_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconBrandGithub size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Expand sidebar" position="right" withArrow>
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={onExpand}
            data-testid={setDataTestId('expand-sidebar-button')}
          >
            <IconLayoutSidebarLeftExpand size={20} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    </Stack>
  );
};

CollapsedNavbar.displayName = 'CollapsedNavbar';
