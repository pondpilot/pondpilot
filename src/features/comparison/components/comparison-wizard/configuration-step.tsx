import {
  Stack,
  Text,
  Paper,
  MultiSelect,
  Textarea,
  Checkbox,
  Group,
  Alert,
  Badge,
  useMantineTheme,
} from '@mantine/core';
import { ComparisonConfig, TabReactiveState, ComparisonTab } from '@models/tab';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState, useEffect } from 'react';

import { ICON_CLASSES } from '../../constants/color-classes';
import { getStatusAccentColor, getStatusSurfaceColor } from '../../utils/theme';

interface ConfigurationStepProps {
  tab: TabReactiveState<ComparisonTab>;
  onConfigChange: (config: Partial<ComparisonConfig>) => void;
}

export const ConfigurationStep = ({ tab, onConfigChange }: ConfigurationStepProps) => {
  const theme = useMantineTheme();
  const { schemaComparison, config } = tab;

  // Initialize all hooks before any early returns (Rules of Hooks)
  const [selectedJoinKeys, setSelectedJoinKeys] = useState<string[]>(
    config?.joinColumns || schemaComparison?.suggestedKeys || [],
  );
  const [filterA, setFilterA] = useState<string>(config?.filterA || '');
  const [filterB, setFilterB] = useState<string>(config?.filterB || '');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    config?.compareColumns || schemaComparison?.commonColumns.map((c) => c.name) || [],
  );
  const [showOnlyDifferences, setShowOnlyDifferences] = useState<boolean>(
    config?.showOnlyDifferences !== undefined ? config.showOnlyDifferences : true,
  );

  // Update parent when config changes
  useEffect(() => {
    if (!schemaComparison) return;
    onConfigChange({
      joinColumns: selectedJoinKeys,
      filterMode: 'common',
      commonFilter: null,
      filterA: filterA.trim() || null,
      filterB: filterB.trim() || null,
      compareColumns:
        selectedColumns.length === schemaComparison.commonColumns.length ? null : selectedColumns,
      showOnlyDifferences,
      compareMode: 'strict',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedJoinKeys,
    filterA,
    filterB,
    selectedColumns,
    showOnlyDifferences,
    onConfigChange,
    // schemaComparison itself is checked inside the effect
  ]);

  // Check if configuration is available (after all hooks)
  if (!schemaComparison || !config) {
    return (
      <Alert
        icon={<IconInfoCircle size={16} className={ICON_CLASSES.warning} />}
        title="Configuration not available"
        color="background-warning"
      >
        Please go back and complete schema analysis first.
      </Alert>
    );
  }

  const commonColumnOptions = schemaComparison.commonColumns.map((col) => ({
    value: col.name,
    label: col.name,
  }));

  const joinKeyOptions = schemaComparison.commonColumns.map((col) => ({
    value: col.name,
    label: col.name,
  }));

  const hasTypeMismatches = schemaComparison.commonColumns.some((col) => !col.typesMatch);

  return (
    <Stack gap="lg">
      <div>
        <Text size="lg" fw={600} mb="md">
          Configure Comparison
        </Text>
        <Text size="sm" c="dimmed">
          Set join keys, filters, and comparison options
        </Text>
      </div>

      {/* Join Keys */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <div>
            <Group gap="xs" mb="xs">
              <Text size="sm" fw={600}>
                Join Keys (Required)
              </Text>
              {schemaComparison.suggestedKeys.length > 0 && (
                <Badge
                  size="sm"
                  variant="light"
                  style={{
                    backgroundColor: getStatusSurfaceColor(theme, 'added'),
                    color: getStatusAccentColor(theme, 'added'),
                  }}
                >
                  Auto-detected
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              Columns used to match rows between the two sources
            </Text>
          </div>

          <MultiSelect
            data={joinKeyOptions}
            value={selectedJoinKeys}
            onChange={setSelectedJoinKeys}
            placeholder="Select one or more columns"
            searchable
            clearable={false}
            error={selectedJoinKeys.length === 0 ? 'At least one join key is required' : undefined}
          />

          {selectedJoinKeys.length > 0 && (
            <Text size="xs" c="dimmed">
              Selected: {selectedJoinKeys.join(', ')}
            </Text>
          )}
        </Stack>
      </Paper>

      {/* Column Selection */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <div>
            <Text size="sm" fw={600} mb="xs">
              Columns to Compare
            </Text>
            <Text size="xs" c="dimmed">
              Select which columns to include in the comparison (all selected by default)
            </Text>
          </div>

          <MultiSelect
            data={commonColumnOptions}
            value={selectedColumns}
            onChange={setSelectedColumns}
            placeholder="Select columns to compare"
            searchable
            clearable={false}
          />

          {hasTypeMismatches && (
            <Alert
              icon={<IconInfoCircle size={16} className={ICON_CLASSES.warning} />}
              color="background-warning"
              variant="light"
            >
              Some columns have type mismatches. Comparison will attempt type coercion where
              possible.
            </Alert>
          )}
        </Stack>
      </Paper>

      {/* Filter Criteria */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <div>
            <Text size="sm" fw={600} mb="xs">
              Filter Criteria (Optional)
            </Text>
            <Text size="xs" c="dimmed">
              Add WHERE clauses to filter data before comparison
            </Text>
          </div>

          <div>
            <Text size="xs" fw={500} mb="xs">
              Filter for Source A
            </Text>
            <Textarea
              placeholder="e.g., created_at > '2024-01-01' AND status = 'active'"
              value={filterA}
              onChange={(e) => setFilterA(e.currentTarget.value)}
              minRows={2}
              autosize
            />
          </div>

          <div>
            <Text size="xs" fw={500} mb="xs">
              Filter for Source B
            </Text>
            <Textarea
              placeholder="e.g., created_at > '2024-01-01' AND status = 'active'"
              value={filterB}
              onChange={(e) => setFilterB(e.currentTarget.value)}
              minRows={2}
              autosize
            />
          </div>
        </Stack>
      </Paper>

      {/* Display Options */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Text size="sm" fw={600}>
            Display Options
          </Text>

          <Checkbox
            label="Show only rows with differences"
            description="Hide rows where all compared columns are identical (recommended for large datasets)"
            checked={showOnlyDifferences}
            onChange={(e) => setShowOnlyDifferences(e.currentTarget.checked)}
          />
        </Stack>
      </Paper>
    </Stack>
  );
};
