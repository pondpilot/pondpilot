import { SegmentedControl, ActionIcon, Tooltip } from '@mantine/core';
import {
  IconLayoutDistributeHorizontal,
  IconLayoutDistributeVertical,
  IconRefresh,
} from '@tabler/icons-react';

interface SchemaControlsProps {
  direction: 'TB' | 'LR';
  isLoading: boolean;
  onDirectionChange: () => void;
  onRefresh: () => void;
}

export const SchemaControls = ({
  direction,
  isLoading,
  onDirectionChange,
  onRefresh,
}: SchemaControlsProps) => {
  return (
    <div className="p-2 bg-white dark:bg-slate-800 rounded shadow flex items-center gap-2">
      <SegmentedControl
        size="xs"
        value={direction}
        onChange={() => onDirectionChange()}
        data={[
          {
            value: 'TB',
            label: (
              <Tooltip label="Vertical Layout" withinPortal>
                <IconLayoutDistributeVertical size={16} />
              </Tooltip>
            ),
          },
          {
            value: 'LR',
            label: (
              <Tooltip label="Horizontal Layout" withinPortal>
                <IconLayoutDistributeHorizontal size={16} />
              </Tooltip>
            ),
          },
        ]}
      />

      <Tooltip label="Refresh Schema" withinPortal>
        <ActionIcon
          size="sm"
          variant="subtle"
          onClick={onRefresh}
          loading={isLoading}
          className="hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
};
