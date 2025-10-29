import { useAppTheme } from '@hooks/use-app-theme';
import { Box, Group, Paper, Stack, Text, TextInput, useMantineTheme } from '@mantine/core';
import { SchemaComparisonResult } from '@models/tab';
import { IconArrowRight, IconCheck, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { ICON_CLASSES } from '../constants/color-classes';
import { getStatusAccentColor, getStatusSurfaceColor, getThemeColorValue } from '../utils/theme';

interface ColumnMapperProps {
  schemaComparison: SchemaComparisonResult;
  columnMappings: Record<string, string>;
  onMappingsChange: (mappings: Record<string, string>) => void;
}

export const ColumnMapper = ({
  schemaComparison,
  columnMappings,
  onMappingsChange,
}: ColumnMapperProps) => {
  const theme = useMantineTheme();
  const colorScheme = useAppTheme();
  const baseTextColor = getThemeColorValue(theme, 'text-primary', colorScheme === 'dark' ? 0 : 9);

  // Track which Source A column is currently being mapped
  const [selectedSourceA, setSelectedSourceA] = useState<string | null>(null);

  // Search filters for each column list
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');

  // Build lists of columns
  const columnsA = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInA.map((c) => c.name),
  ];

  const columnsB = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInB.map((c) => c.name),
  ];

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

  // Get the mapping status for a Source A column
  const getMappingStatus = (
    colA: string,
  ): { type: 'auto' | 'custom' | 'unmapped'; targetB?: string } => {
    // Check if there's a custom mapping
    if (columnMappings[colA]) {
      return { type: 'custom', targetB: columnMappings[colA] };
    }

    // Check if it's automatically matched (same name in both)
    if (columnsB.includes(colA)) {
      return { type: 'auto', targetB: colA };
    }

    return { type: 'unmapped' };
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
          borderColor: isSelected
            ? getStatusAccentColor(theme, 'added', colorScheme)
            : undefined,
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
          <Text size="xs" c="dimmed">
            Click a column in Source A, then click its match in Source B
          </Text>
        </Group>

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
                  const status = getMappingStatus(col);
                  const isSelected = selectedSourceA === col;
                  const isMapped = status.type !== 'unmapped';

                  return (
                    <Group key={col} gap="xs" wrap="nowrap">
                      {renderColumnItem(
                        col,
                        'A',
                        () => handleSourceAClick(col),
                        isSelected,
                        isMapped,
                      )}
                      {status.type === 'auto' && (
                        <Group gap={4} wrap="nowrap">
                          <IconArrowRight size={14} className={ICON_CLASSES.success} />
                          <Text size="xs" c="dimmed">
                            auto
                          </Text>
                        </Group>
                      )}
                      {status.type === 'custom' && (
                        <Group gap={4} wrap="nowrap">
                          <IconArrowRight size={14} className={ICON_CLASSES.accent} />
                          <Text size="xs" fw={500} style={{ color: baseTextColor }}>
                            {status.targetB}
                          </Text>
                          <IconX
                            size={14}
                            className={ICON_CLASSES.error}
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleRemoveMapping(col)}
                          />
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
          <Group gap={4}>
            <IconCheck size={12} className={ICON_CLASSES.success} />
            <Text size="xs" c="dimmed">
              Auto-matched (same name)
            </Text>
          </Group>
          <Group gap={4}>
            <IconArrowRight size={12} className={ICON_CLASSES.accent} />
            <Text size="xs" c="dimmed">
              Custom mapping
            </Text>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
};
