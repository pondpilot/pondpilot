import { Group, Button, ActionIcon, Tooltip } from '@mantine/core';
import { IconRefresh, IconSettings, IconDownload, IconCopy, IconTrash } from '@tabler/icons-react';

interface ComparisonToolbarProps {
  onReconfigure: () => void;
  onRefresh: () => void;
  onExport: () => void;
  onCopy: () => void;
  isRefreshing?: boolean;
  onClearResults?: () => void;
  isClearing?: boolean;
}

export const ComparisonToolbar = ({
  onReconfigure,
  onRefresh,
  onExport,
  onCopy,
  isRefreshing = false,
  onClearResults,
  isClearing = false,
}: ComparisonToolbarProps) => {
  return (
    <Group gap="sm" justify="flex-end">
      <Tooltip label="Reconfigure comparison">
        <ActionIcon
          variant="subtle"
          color="icon-default"
          size="lg"
          onClick={onReconfigure}
          disabled={isRefreshing}
        >
          <IconSettings size={18} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Refresh comparison">
        <ActionIcon
          variant="subtle"
          color="icon-accent"
          size="lg"
          onClick={onRefresh}
          loading={isRefreshing}
        >
          <IconRefresh size={18} />
        </ActionIcon>
      </Tooltip>

      {onClearResults && (
        <Button
          variant="light"
          color="error"
          leftSection={<IconTrash size={16} />}
          onClick={onClearResults}
          loading={isClearing}
          disabled={isRefreshing || isClearing}
        >
          Clear Results
        </Button>
      )}

      <Button
        variant="light"
        color="background-accent"
        leftSection={<IconCopy size={16} />}
        onClick={onCopy}
        disabled={isRefreshing}
      >
        Copy
      </Button>

      <Button
        variant="light"
        color="background-accent"
        leftSection={<IconDownload size={16} />}
        onClick={onExport}
        disabled={isRefreshing}
      >
        Export CSV
      </Button>
    </Group>
  );
};
