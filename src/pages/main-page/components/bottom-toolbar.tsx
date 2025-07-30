import { ActionIcon, Group, Tooltip, Box } from '@mantine/core';
import { APP_GITHUB_URL } from '@models/app-urls';
import {
  IconBrandGithub,
  IconSettings,
  IconLayoutSidebarLeftCollapse,
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

  return (
    <Box className="flex-shrink-0 h-[34px] px-3 flex items-center justify-between border-t border-borderPrimary-light dark:border-borderPrimary-dark">
      <Group gap="xs" className="flex-shrink-0">
        <ActionIcon
          size="sm"
          data-testid={setDataTestId('settings-button')}
          onClick={() => navigate('/settings')}
          className="flex-shrink-0"
        >
          <IconSettings size={20} />
        </ActionIcon>
        <ActionIcon
          size="sm"
          component="a"
          href={APP_GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0"
        >
          <IconBrandGithub size={20} />
        </ActionIcon>
      </Group>
      {onCollapse && (
        <Tooltip label="Collapse sidebar" position="top" withArrow openDelay={500}>
          <ActionIcon
            size="sm"
            data-testid={setDataTestId('collapse-sidebar-button')}
            onClick={onCollapse}
            variant="subtle"
            className="flex-shrink-0"
          >
            <IconLayoutSidebarLeftCollapse size={20} />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  );
};

BottomToolbar.displayName = 'BottomToolbar';