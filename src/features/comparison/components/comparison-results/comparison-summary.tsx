import { Paper, Group, Stack, Text, RingProgress, Badge, useMantineTheme } from '@mantine/core';
import { IconPlus, IconMinus, IconPencil, IconCheck } from '@tabler/icons-react';

import {
  COMPARISON_STATUS_THEME,
  getStatusAccentColor,
  getStatusSurfaceColor,
} from '../../utils/theme';

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
  const theme = useMantineTheme();

  // Calculate percentages for ring progress
  const sections = [];
  if (added > 0) {
    sections.push({
      value: (added / total) * 100,
      color: COMPARISON_STATUS_THEME.added.accentColorKey,
    });
  }
  if (removed > 0) {
    sections.push({
      value: (removed / total) * 100,
      color: COMPARISON_STATUS_THEME.removed.accentColorKey,
    });
  }
  if (modified > 0) {
    sections.push({
      value: (modified / total) * 100,
      color: COMPARISON_STATUS_THEME.modified.accentColorKey,
    });
  }
  if (same > 0) {
    sections.push({
      value: (same / total) * 100,
      color: COMPARISON_STATUS_THEME.same.accentColorKey,
    });
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
              <IconPlus size={16} style={{ color: getStatusAccentColor(theme, 'added') }} />
              <Badge
                variant="light"
                style={{
                  backgroundColor: getStatusSurfaceColor(theme, 'added'),
                  color: getStatusAccentColor(theme, 'added'),
                }}
              >
                {added} Added
              </Badge>
              <Text size="xs" c="dimmed">
                ({((added / total) * 100).toFixed(1)}%)
              </Text>
            </Group>

            <Group gap="xs">
              <IconMinus size={16} style={{ color: getStatusAccentColor(theme, 'removed') }} />
              <Badge
                variant="light"
                style={{
                  backgroundColor: getStatusSurfaceColor(theme, 'removed'),
                  color: getStatusAccentColor(theme, 'removed'),
                }}
              >
                {removed} Removed
              </Badge>
              <Text size="xs" c="dimmed">
                ({((removed / total) * 100).toFixed(1)}%)
              </Text>
            </Group>

            <Group gap="xs">
              <IconPencil size={16} style={{ color: getStatusAccentColor(theme, 'modified') }} />
              <Badge
                variant="light"
                style={{
                  backgroundColor: getStatusSurfaceColor(theme, 'modified'),
                  color: getStatusAccentColor(theme, 'modified'),
                }}
              >
                {modified} Modified
              </Badge>
              <Text size="xs" c="dimmed">
                ({((modified / total) * 100).toFixed(1)}%)
              </Text>
            </Group>

            <Group gap="xs">
              <IconCheck size={16} style={{ color: getStatusAccentColor(theme, 'same') }} />
              <Badge
                variant="light"
                style={{
                  backgroundColor: getStatusSurfaceColor(theme, 'same'),
                  color: getStatusAccentColor(theme, 'same'),
                }}
              >
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
