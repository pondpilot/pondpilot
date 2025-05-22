import { ActionIcon } from '@mantine/core';
import { IconLayoutBottombarExpand } from '@tabler/icons-react';
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
  return (
    <ActionIcon
      variant="subtle"
      size="sm"
      onClick={onClick}
      data-testid={setDataTestId('metadata-stats-button')}
      color={isOpen ? 'primary' : 'gray'}
    >
      <IconLayoutBottombarExpand size={16} />
    </ActionIcon>
  );
}
