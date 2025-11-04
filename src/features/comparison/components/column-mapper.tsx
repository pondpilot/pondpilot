import { useAppTheme } from '@hooks/use-app-theme';
import {
  Alert,
  Box,
  Checkbox,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  useMantineTheme,
} from '@mantine/core';
import { SchemaComparisonResult } from '@models/tab';
import { IconAlertCircle, IconArrowRight, IconX } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { ICON_CLASSES } from '../constants/color-classes';
import { getStatusAccentColor, getStatusSurfaceColor, getThemeColorValue } from '../utils/theme';

interface ColumnMapperProps {
  schemaComparison: SchemaComparisonResult;
  columnMappings: Record<string, string>;
  joinColumns: string[]; // Exclude these from the mapper
  joinKeyMappings: Record<string, string>; // Need this to exclude mapped B columns
  onMappingsChange: (mappings: Record<string, string>) => void;
}

export const ColumnMapper = ({
  schemaComparison,
  columnMappings,
  joinColumns,
  joinKeyMappings,
  onMappingsChange,
}: ColumnMapperProps) => {
  const theme = useMantineTheme();
  const colorScheme = useAppTheme();
  const baseTextColor = getThemeColorValue(theme, 'text-primary', colorScheme === 'dark' ? 0 : 9);

  // Toggle between showing auto-matched columns and custom mapping UI
  const [showMappingUI, setShowMappingUI] = useState(false);

  // Track which Source A column is currently being mapped
  const [selectedSourceA, setSelectedSourceA] = useState<string | null>(null);

  // Search filters for each column list
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');

  // Memoize derived column lists to prevent unnecessary recalculations
  const {
    joinKeyBColumns: _joinKeyBColumns,
    columnsA,
    columnsB,
    mappedColumns,
    unmappedColumns,
  } = useMemo(() => {
    // Get join key B columns (mapped or same name)
    const joinKeyBCols = joinColumns.map((keyA) => joinKeyMappings[keyA] || keyA);

    // Build lists of columns (excluding join keys from both sources)
    const allColumnsA = [
      ...schemaComparison.commonColumns.map((c) => c.name),
      ...schemaComparison.onlyInA.map((c) => c.name),
    ].filter((col) => !joinColumns.includes(col));

    const allColumnsB = [
      ...schemaComparison.commonColumns.map((c) => c.name),
      ...schemaComparison.onlyInB.map((c) => c.name),
    ].filter((col) => !joinKeyBCols.includes(col));

    // Separate columns into mapped and unmapped
    // Mapped = has custom mapping OR auto mapping (same name in both)
    const mapped = allColumnsA.filter((colA) => columnMappings[colA] || allColumnsB.includes(colA));
    const unmapped = allColumnsA.filter(
      (colA) => !columnMappings[colA] && !allColumnsB.includes(colA),
    );

    return {
      joinKeyBColumns: joinKeyBCols,
      columnsA: allColumnsA,
      columnsB: allColumnsB,
      mappedColumns: mapped,
      unmappedColumns: unmapped,
    };
  }, [schemaComparison, joinColumns, joinKeyMappings, columnMappings]);

  // Filter columns based on search
  const filteredColumnsA = columnsA.filter((col) =>
    col.toLowerCase().includes(searchA.toLowerCase()),
  );
  const filteredColumnsB = columnsB.filter((col) =>
    col.toLowerCase().includes(searchB.toLowerCase()),
  );

  // Reverse mapping: Source B -> Source A
  const reverseMappings = Object.entries(columnMappings).reduce(
    (acc, [sourceA, sourceB]) => {
      acc[sourceB] = sourceA;
      return acc;
    },
    {} as Record<string, string>,
  );

  // Get the target B column for a Source A column (if mapped)
  const getTargetColumn = (colA: string): string | null => {
    // Check custom mapping first
    if (columnMappings[colA]) {
      return columnMappings[colA];
    }
    // Check auto mapping (same name in both)
    if (columnsB.includes(colA)) {
      return colA;
    }
    return null;
  };

  // Handle clicking on a Source A column
  const handleSourceAClick = (colA: string) => {
    if (selectedSourceA === colA) {
      // Deselect if clicking the same column
      setSelectedSourceA(null);
    } else {
      setSelectedSourceA(colA);
    }
  };

  // Handle clicking on a Source B column
  const handleSourceBClick = (colB: string) => {
    if (!selectedSourceA) return;

    const newMappings = { ...columnMappings };

    // If this Source B column is already mapped to a different Source A column, remove that mapping
    if (reverseMappings[colB] && reverseMappings[colB] !== selectedSourceA) {
      delete newMappings[reverseMappings[colB]];
    }

    // If Source A and B have the same name, don't create an explicit mapping (it's automatic)
    if (selectedSourceA === colB) {
      // Remove any existing custom mapping
      delete newMappings[selectedSourceA];
    } else {
      // Create or update the mapping
      newMappings[selectedSourceA] = colB;
    }

    onMappingsChange(newMappings);
    setSelectedSourceA(null);
  };

  // Handle removing a mapping
  const handleRemoveMapping = (colA: string) => {
    const newMappings = { ...columnMappings };
    delete newMappings[colA];
    onMappingsChange(newMappings);
  };

  // Render a column item
  const renderColumnItem = (
    col: string,
    side: 'A' | 'B',
    onClick: () => void,
    isSelected: boolean,
    isMapped: boolean,
  ) => {
    const isClickable = side === 'A' || selectedSourceA !== null;
    const backgroundColor = isSelected
      ? getStatusSurfaceColor(theme, 'added', colorScheme)
      : isMapped
        ? getStatusSurfaceColor(theme, 'modified', colorScheme)
        : undefined;

    const textColor = isSelected
      ? getStatusAccentColor(theme, 'added', colorScheme)
      : isMapped
        ? getStatusAccentColor(theme, 'modified', colorScheme)
        : baseTextColor;

    return (
      <Paper
        key={col}
        p="xs"
        withBorder
        style={{
          cursor: isClickable ? 'pointer' : 'default',
          backgroundColor,
          borderColor: isSelected ? getStatusAccentColor(theme, 'added', colorScheme) : undefined,
          borderWidth: isSelected ? 2 : 1,
        }}
        onClick={isClickable ? onClick : undefined}
      >
        <Text size="sm" style={{ color: textColor }}>
          {col}
        </Text>
      </Paper>
    );
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={600}>
            Column Mapping
          </Text>
          <Checkbox
            label="Custom mapping"
            checked={showMappingUI}
            onChange={(e) => setShowMappingUI(e.currentTarget.checked)}
          />
        </Group>

        {/* Mapping summary */}
        <Collapse in={!showMappingUI}>
          <Group gap="md">
            {mappedColumns.length > 0 && (
              <Text size="sm" c="dimmed">
                {mappedColumns.length} column{mappedColumns.length > 1 ? 's' : ''} mapped
              </Text>
            )}

            {unmappedColumns.length > 0 && (
              <Alert
                icon={<IconAlertCircle size={16} className={ICON_CLASSES.warning} />}
                color="background-warning"
                variant="light"
                p="xs"
              >
                <Text size="sm">
                  {unmappedColumns.length} unmapped column{unmappedColumns.length > 1 ? 's' : ''}.
                  Use custom mapping to define mappings.
                </Text>
              </Alert>
            )}
          </Group>
        </Collapse>

        {/* Custom mapping UI */}
        <Collapse in={showMappingUI}>
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              Click a column in Source A, then click its match in Source B
            </Text>

            <Group align="flex-start" gap="md" wrap="nowrap">
              {/* Source A Column List */}
              <Box style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                    Source A
                  </Text>
                  <TextInput
                    placeholder="Search columns..."
                    value={searchA}
                    onChange={(e) => setSearchA(e.currentTarget.value)}
                    size="xs"
                  />
                  <Stack gap="xs" style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {filteredColumnsA.map((col) => {
                      const targetCol = getTargetColumn(col);
                      const isSelected = selectedSourceA === col;
                      const isMapped = targetCol !== null;
                      const hasCustomMapping = !!columnMappings[col];

                      return (
                        <Group key={col} gap="xs" wrap="nowrap">
                          {renderColumnItem(
                            col,
                            'A',
                            () => handleSourceAClick(col),
                            isSelected,
                            isMapped,
                          )}
                          {isMapped && (
                            <Group gap={4} wrap="nowrap">
                              <IconArrowRight size={14} style={{ color: baseTextColor }} />
                              <Text
                                size="xs"
                                fw={500}
                                style={{ color: baseTextColor }}
                                c={hasCustomMapping ? undefined : 'dimmed'}
                              >
                                {targetCol}
                              </Text>
                              {hasCustomMapping && (
                                <IconX
                                  size={14}
                                  style={{
                                    cursor: 'pointer',
                                    color: getThemeColorValue(
                                      theme,
                                      'text-secondary',
                                      colorScheme === 'dark' ? 3 : 6,
                                    ),
                                  }}
                                  onClick={() => handleRemoveMapping(col)}
                                />
                              )}
                            </Group>
                          )}
                        </Group>
                      );
                    })}
                  </Stack>
                </Stack>
              </Box>

              {/* Source B Column List */}
              <Box style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                    Source B
                  </Text>
                  <TextInput
                    placeholder="Search columns..."
                    value={searchB}
                    onChange={(e) => setSearchB(e.currentTarget.value)}
                    size="xs"
                    disabled={!selectedSourceA}
                  />
                  <Stack gap="xs" style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {filteredColumnsB.map((col) => {
                      const isSelected = false; // Source B columns are never "selected"
                      const isMapped = !!reverseMappings[col];

                      return renderColumnItem(
                        col,
                        'B',
                        () => handleSourceBClick(col),
                        isSelected,
                        isMapped,
                      );
                    })}
                  </Stack>
                </Stack>
              </Box>
            </Group>

            {/* Legend */}
            <Group gap="md">
              <Group gap={4}>
                <Box
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: getStatusSurfaceColor(theme, 'added', colorScheme),
                  }}
                />
                <Text size="xs" c="dimmed">
                  Selected
                </Text>
              </Group>
              <Group gap={4}>
                <Box
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: getStatusSurfaceColor(theme, 'modified', colorScheme),
                  }}
                />
                <Text size="xs" c="dimmed">
                  Mapped
                </Text>
              </Group>
            </Group>
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
};
