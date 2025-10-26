import { Stack, Text, Paper, Badge, Group, Alert, Collapse, Button } from '@mantine/core';
import { ComparisonTab, TabReactiveState } from '@models/tab';
import { IconAlertCircle, IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';

interface SchemaAnalysisStepProps {
  tab: TabReactiveState<ComparisonTab>;
}

export const SchemaAnalysisStep = ({ tab }: SchemaAnalysisStepProps) => {
  const [showOnlyInA, setShowOnlyInA] = useState(true);
  const [showOnlyInB, setShowOnlyInB] = useState(true);

  if (!tab.schemaComparison) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="No schema analysis" color="yellow">
        Schema comparison data is not available. Please go back and select sources.
      </Alert>
    );
  }

  const { commonColumns, onlyInA, onlyInB, suggestedKeys } = tab.schemaComparison;
  const hasTypeMismatches = commonColumns.some((col) => !col.typesMatch);
  const hasNoCommonColumns = commonColumns.length === 0;

  return (
    <Stack gap="lg">
      <div>
        <Text size="lg" fw={600} mb="md">
          Schema Analysis
        </Text>
        <Text size="sm" c="dimmed">
          Review schema differences between the two sources
        </Text>
      </div>

      {/* Error: No common columns */}
      {hasNoCommonColumns && (
        <Alert icon={<IconAlertCircle size={16} />} title="No Common Columns" color="red">
          The two data sources have no columns with matching names. Comparison requires at least one
          common column to use as a join key. Please select different sources or ensure the sources
          have matching column names.
        </Alert>
      )}

      {/* Warning: No suggested keys */}
      {!hasNoCommonColumns && suggestedKeys.length === 0 && (
        <Alert icon={<IconAlertCircle size={16} />} title="No Join Keys Detected" color="yellow">
          No primary key columns were detected. You will need to manually select join key(s) in the
          next step. Make sure to choose column(s) that uniquely identify rows in both sources.
        </Alert>
      )}

      {/* Summary */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group gap="xs">
            <IconCheck size={16} color="green" />
            <Text size="sm" fw={500}>
              {commonColumns.length} common columns
            </Text>
          </Group>

          {hasTypeMismatches && (
            <Group gap="xs">
              <IconAlertCircle size={16} color="orange" />
              <Text size="sm" c="orange">
                {commonColumns.filter((col) => !col.typesMatch).length} type mismatches detected
              </Text>
            </Group>
          )}

          {onlyInA.length > 0 && (
            <Group gap="xs">
              <IconAlertCircle size={16} color="blue" />
              <Text size="sm" c="blue">
                {onlyInA.length} columns only in Source A
              </Text>
            </Group>
          )}

          {onlyInB.length > 0 && (
            <Group gap="xs">
              <IconAlertCircle size={16} color="blue" />
              <Text size="sm" c="blue">
                {onlyInB.length} columns only in Source B
              </Text>
            </Group>
          )}

          {suggestedKeys.length > 0 && (
            <div>
              <Text size="sm" fw={500} mb="xs">
                Suggested join keys:
              </Text>
              <Group gap="xs">
                {suggestedKeys.map((key) => (
                  <Badge key={key} color="green" variant="light">
                    {key}
                  </Badge>
                ))}
              </Group>
            </div>
          )}
        </Stack>
      </Paper>

      {/* Common Columns */}
      <Paper p="md" withBorder>
        <Text size="sm" fw={600} mb="md">
          Common Columns ({commonColumns.length})
        </Text>
        <Stack gap="xs">
          {commonColumns.map((col) => (
            <Group key={col.name} justify="space-between">
              <Text size="sm" fw={500}>
                {col.name}
              </Text>
              <Group gap="xs">
                <Badge size="sm" variant="light" color={col.typesMatch ? 'green' : 'orange'}>
                  A: {col.typeA}
                </Badge>
                <Badge size="sm" variant="light" color={col.typesMatch ? 'green' : 'orange'}>
                  B: {col.typeB}
                </Badge>
                {!col.typesMatch && (
                  <IconAlertCircle size={14} color="orange" title="Type mismatch" />
                )}
              </Group>
            </Group>
          ))}
          {commonColumns.length === 0 && (
            <Text size="sm" c="dimmed" fs="italic">
              No common columns found
            </Text>
          )}
        </Stack>
      </Paper>

      {/* Columns only in A */}
      {onlyInA.length > 0 && (
        <Paper p="md" withBorder>
          <Group justify="space-between" mb="md">
            <Text size="sm" fw={600}>
              Only in Source A ({onlyInA.length})
            </Text>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setShowOnlyInA(!showOnlyInA)}
              rightSection={
                <IconChevronDown
                  size={14}
                  style={{
                    transform: showOnlyInA ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms',
                  }}
                />
              }
            >
              {showOnlyInA ? 'Hide' : 'Show'}
            </Button>
          </Group>
          <Collapse in={showOnlyInA}>
            <Stack gap="xs">
              {onlyInA.map((col) => (
                <Group key={col.name} justify="space-between">
                  <Text size="sm" fw={500}>
                    {col.name}
                  </Text>
                  <Badge size="sm" variant="light" color="blue">
                    {col.type}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </Collapse>
        </Paper>
      )}

      {/* Columns only in B */}
      {onlyInB.length > 0 && (
        <Paper p="md" withBorder>
          <Group justify="space-between" mb="md">
            <Text size="sm" fw={600}>
              Only in Source B ({onlyInB.length})
            </Text>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setShowOnlyInB(!showOnlyInB)}
              rightSection={
                <IconChevronDown
                  size={14}
                  style={{
                    transform: showOnlyInB ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms',
                  }}
                />
              }
            >
              {showOnlyInB ? 'Hide' : 'Show'}
            </Button>
          </Group>
          <Collapse in={showOnlyInB}>
            <Stack gap="xs">
              {onlyInB.map((col) => (
                <Group key={col.name} justify="space-between">
                  <Text size="sm" fw={500}>
                    {col.name}
                  </Text>
                  <Badge size="sm" variant="light" color="blue">
                    {col.type}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </Collapse>
        </Paper>
      )}
    </Stack>
  );
};
