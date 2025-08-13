import { WHATS_NEW_MODAL_OPTIONS, WhatsNewModal } from '@features/whats-new-modal';
import { useIsTauri } from '@hooks/use-is-tauri';
import { ActionIcon, Group, Tooltip, Box, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { APP_GITHUB_URL } from '@models/app-urls';
import { IconBrandGithub, IconSettings, IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useNavigate } from 'react-router-dom';

interface BottomToolbarProps {
  onCollapse?: () => void;
}

/**
 * Bottom toolbar component for the navbar with settings, GitHub link, and version (Tauri only)
 */
export const BottomToolbar = ({ onCollapse }: BottomToolbarProps) => {
  const navigate = useNavigate();
  const isTauri = useIsTauri();

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

      {/* Show version in Tauri, collapse button in web */}
      {isTauri ? (
        <Tooltip label="Release Notes" position="top" openDelay={500}>
          <Text
            size="xs"
            c="text-secondary"
            className="font-mono cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const modalId = modals.open({
                ...WHATS_NEW_MODAL_OPTIONS,
                children: <WhatsNewModal onClose={() => modals.close(modalId)} />,
              });
            }}
          >
            v{__VERSION__}
          </Text>
        </Tooltip>
      ) : (
        onCollapse && (
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
        )
      )}
    </Box>
  );
};

BottomToolbar.displayName = 'BottomToolbar';
