import { ActionIcon, Tooltip } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';

interface MetadataStatsButtonProps {
  /**
   * Function to call when the button is clicked
   */
  onClick: () => void;

  /**
   * Whether metadata stats are currently open
   */
  isOpen?: boolean;
}

export function MetadataStatsButton({ onClick, isOpen = false }: MetadataStatsButtonProps) {
  const tooltipLabel = isOpen ? 'Hide metadata stats (Ctrl+M)' : 'Show metadata stats (Ctrl+M)';

  return (
    <Tooltip label={tooltipLabel}>
      <ActionIcon
        className="bg-background-secondary shadow-md"
        size="md"
        radius="xl"
        variant="filled"
        onClick={onClick}
        data-testid={setDataTestId('metadata-stats-button')}
        color={isOpen ? 'primary' : 'gray'}
      >
        <IconChartBar size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
