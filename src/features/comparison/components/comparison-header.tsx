import { Group, Text, Button } from '@mantine/core';
import { IconLoader2 } from '@tabler/icons-react';
import React from 'react';

interface ComparisonHeaderProps {
  onRun: () => void;
  canRun: boolean;
  isRunning: boolean;
  executionTime?: number | null;
}

export const ComparisonHeader = ({
  onRun,
  canRun,
  isRunning,
  executionTime,
}: ComparisonHeaderProps) => {
  return (
    <Group className="px-3 h-10" justify="space-between">
      <Group gap={4}>
        {isRunning && (
          <>
            <IconLoader2
              size={18}
              className="animate-spin text-textSecondary-light dark:text-textSecondary-dark"
            />
            <Text c="text-secondary" className="text-sm font-medium">
              Running comparison...
            </Text>
          </>
        )}
        {!isRunning && executionTime !== null && executionTime !== undefined && (
          <Text c="text-success" className="text-sm font-medium">
            Completed in {executionTime.toFixed(1)}s
          </Text>
        )}
      </Group>
      <Button
        onClick={onRun}
        disabled={!canRun || isRunning}
        loading={isRunning}
        className="min-w-32"
      >
        Run Comparison
      </Button>
    </Group>
  );
};
