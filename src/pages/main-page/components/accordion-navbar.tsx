import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { ActionIcon, Stack, Tooltip, Box } from '@mantine/core';
import { APP_GITHUB_URL } from '@models/app-urls';
import {
  IconBrandGithub,
  IconPlus,
  IconSettings,
  IconLayoutSidebarRightCollapse,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useNavigate } from 'react-router-dom';

import { AccordionContent } from './accordion-content';
import { BottomToolbar } from './bottom-toolbar';

interface NavbarProps {
  onCollapse?: () => void;
  collapsed?: boolean;
}

/**
 * Accordion-style navigation bar with collapsible sections
 */
export const AccordionNavbar = ({ onCollapse, collapsed = false }: NavbarProps) => {
  const navigate = useNavigate();

  // Render compact view when collapsed
  if (collapsed) {
    return (
      <Stack className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark" gap={0}>
        {/* Create New Query button */}
        <Box className="p-2 mx-auto border-b border-borderPrimary-light dark:border-borderPrimary-dark">
          <Tooltip label="Create new query" position="right" withArrow openDelay={500}>
            <ActionIcon
              size="lg"
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
        <Box className="mt-auto mx-auto border-t border-borderPrimary-light dark:border-borderPrimary-dark p-2">
          <Stack gap="xs">
            <Tooltip label="Settings" position="right" withArrow openDelay={500}>
              <ActionIcon
                size="lg"
                data-testid={setDataTestId('settings-button')}
                onClick={() => navigate('/settings')}
              >
                <IconSettings size={20} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="GitHub" position="right" withArrow openDelay={500}>
              <ActionIcon
                size="lg"
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
    <Stack className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark" gap={0}>
      {/* Accordion Container - takes remaining space minus bottom toolbar */}
      <Box className="flex-1" style={{ height: 'calc(100% - 34px)' }}>
        <AccordionContent />
      </Box>

      {/* Bottom Toolbar - fixed height, isolated from accordion logic */}
      <BottomToolbar onCollapse={onCollapse} />
    </Stack>
  );
};

AccordionNavbar.displayName = 'AccordionNavbar';
