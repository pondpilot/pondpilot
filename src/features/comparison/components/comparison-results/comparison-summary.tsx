import { Paper, Group, Stack, Text, RingProgress, Badge } from '@mantine/core';
import { IconPlus, IconMinus, IconPencil, IconCheck } from '@tabler/icons-react';

interface ComparisonSummaryProps {
  stats: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    same: number;
  };
}

export const ComparisonSummary = ({ stats }: ComparisonSummaryProps) => {
  const { total, added, removed, modified, same } = stats;

  // Calculate percentages for ring progress
  const sections = [];
  if (added > 0) {
    sections.push({ value: (added / total) * 100, color: 'green' });
  }
  if (removed > 0) {
    sections.push({ value: (removed / total) * 100, color: 'red' });
  }
  if (modified > 0) {
    sections.push({ value: (modified / total) * 100, color: 'yellow' });
  }
  if (same > 0) {
    sections.push({ value: (same / total) * 100, color: 'gray' });
  }

  return (
    <Paper p="md" withBorder>
      <Group gap="xl" align="flex-start">
        {/* Ring Progress */}
        <RingProgress
          size={120}
          thickness={12}
          sections={sections}
          label={
            <Text size="xs" ta="center" fw={700} component="div">
              {total}
              <br />
              <Text size="xs" c="dimmed" fw={400} component="span">
                rows
              </Text>
            </Text>
          }
        />

        {/* Statistics */}
        <Stack gap="sm" style={{ flex: 1 }}>
          <Text size="sm" fw={600}>
            Comparison Summary
          </Text>

          <Group gap="md">
            <Group gap="xs">
              <IconPlus size={16} color="green" />
              <Badge color="green" variant="light">
                {added} Added
              </Badge>
              <Text size="xs" c="dimmed">
                ({((added / total) * 100).toFixed(1)}%)
              </Text>
            </Group>

            <Group gap="xs">
              <IconMinus size={16} color="red" />
              <Badge color="red" variant="light">
                {removed} Removed
              </Badge>
              <Text size="xs" c="dimmed">
                ({((removed / total) * 100).toFixed(1)}%)
              </Text>
            </Group>

            <Group gap="xs">
              <IconPencil size={16} color="orange" />
              <Badge color="yellow" variant="light">
                {modified} Modified
              </Badge>
              <Text size="xs" c="dimmed">
                ({((modified / total) * 100).toFixed(1)}%)
              </Text>
            </Group>

            <Group gap="xs">
              <IconCheck size={16} color="gray" />
              <Badge color="gray" variant="light">
                {same} Unchanged
              </Badge>
              <Text size="xs" c="dimmed">
                ({((same / total) * 100).toFixed(1)}%)
              </Text>
            </Group>
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
};
