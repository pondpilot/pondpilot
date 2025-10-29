import { useBugReportModal } from '@hooks/use-bug-report-modal';
import { ActionIcon, Group, Tooltip, Box } from '@mantine/core';
import { APP_GITHUB_URL } from '@models/app-urls';
import {
  IconBrandGithub,
  IconSettings,
  IconLayoutSidebarLeftCollapse,
  IconBug,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useNavigate } from 'react-router-dom';

interface BottomToolbarProps {
  onCollapse?: () => void;
}

/**
 * Bottom toolbar component for the navbar with settings, GitHub link, and collapse button
 */
export const BottomToolbar = ({ onCollapse }: BottomToolbarProps) => {
  const navigate = useNavigate();
  const { openBugReportModal, isConfigured } = useBugReportModal();

  return (
    <Box className="flex-shrink-0 h-[34px] px-3 flex items-center justify-between border-t border-borderPrimary-light dark:border-borderPrimary-dark">
      <Group gap="xs" className="flex-shrink-0">
        <Tooltip label="Settings" position="top" withArrow openDelay={500}>
          <ActionIcon
            size="sm"
            data-testid={setDataTestId('settings-button')}
            onClick={() => navigate('/settings')}
            className="flex-shrink-0"
            aria-label="Settings"
          >
            <IconSettings size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="GitHub" position="top" withArrow openDelay={500}>
          <ActionIcon
            size="sm"
            component="a"
            href={APP_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
            aria-label="Visit GitHub repository"
          >
            <IconBrandGithub size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label={
            isConfigured
              ? 'Report a Bug'
              : 'Bug reporting is not configured. Please add VITE_SLACK_WEBHOOK_URL to your environment variables.'
          }
          position="top"
          withArrow
          openDelay={500}
        >
          <ActionIcon
            size="sm"
            data-testid={setDataTestId('expanded-bug-report-button')}
            onClick={openBugReportModal}
            disabled={!isConfigured}
            className="flex-shrink-0"
            aria-label="Report a Bug"
          >
            <IconBug size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {onCollapse && (
        <Tooltip label="Collapse sidebar" position="top" withArrow openDelay={500}>
          <ActionIcon
            size="sm"
            data-testid={setDataTestId('collapse-sidebar-button')}
            onClick={onCollapse}
            className="flex-shrink-0"
            aria-label="Collapse sidebar"
          >
            <IconLayoutSidebarLeftCollapse size={20} />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  );
};

BottomToolbar.displayName = 'BottomToolbar';
