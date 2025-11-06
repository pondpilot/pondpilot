import { Group, Button, ActionIcon, Tooltip } from '@mantine/core';
import { IconRefresh, IconSettings, IconDownload, IconTrash, IconTable } from '@tabler/icons-react';
import { ReactNode } from 'react';

interface ComparisonToolbarProps {
  onReconfigure: () => void;
  onRefresh: () => void;
  onExportReport: () => void;
  onOpenTableView: () => void;
  isRefreshing?: boolean;
  onClearResults?: () => void;
  isClearing?: boolean;
  leftContent?: ReactNode;
}

export const ComparisonToolbar = ({
  onReconfigure,
  onRefresh,
  onExportReport,
  onOpenTableView,
  isRefreshing = false,
  onClearResults,
  isClearing = false,
  leftContent,
}: ComparisonToolbarProps) => {
  const hasLeft = Boolean(leftContent);
  return (
    <Group gap="sm" justify={hasLeft ? 'space-between' : 'flex-end'} align="center" wrap="wrap">
      {hasLeft && <Group gap="sm">{leftContent}</Group>}

      <Group gap="sm" align="center">
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
          leftSection={<IconTable size={16} />}
          onClick={onOpenTableView}
          disabled={isRefreshing}
        >
          Open Table View
        </Button>

        <Button
          variant="light"
          color="background-accent"
          leftSection={<IconDownload size={16} />}
          onClick={onExportReport}
          disabled={isRefreshing}
        >
          Export Report
        </Button>
      </Group>
    </Group>
  );
};
