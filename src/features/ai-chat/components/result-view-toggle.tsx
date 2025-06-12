import { SegmentedControl } from '@mantine/core';
import { IconTable, IconChartBar } from '@tabler/icons-react';

export type ResultViewType = 'table' | 'chart';

interface ResultViewToggleProps {
  value: ResultViewType;
  onChange: (value: ResultViewType) => void;
  hasChart: boolean;
}

export const ResultViewToggle = ({ value, onChange, hasChart }: ResultViewToggleProps) => {
  if (!hasChart) {
    return null;
  }

  return (
    <SegmentedControl
      value={value}
      onChange={(val) => onChange(val as ResultViewType)}
      size="xs"
      data={[
        {
          value: 'chart',
          label: (
            <div className="flex items-center gap-1.5">
              <IconChartBar size={14} />
              <span>Chart</span>
            </div>
          ),
        },
        {
          value: 'table',
          label: (
            <div className="flex items-center gap-1.5">
              <IconTable size={14} />
              <span>Table</span>
            </div>
          ),
        },
      ]}
      classNames={{
        root: 'bg-transparent008-light dark:bg-transparent008-dark',
      }}
    />
  );
};