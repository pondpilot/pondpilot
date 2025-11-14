import { useAppTheme } from '@hooks/use-app-theme';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  useMantineTheme,
} from '@mantine/core';
import { SchemaComparisonResult } from '@models/tab';
import { IconAlertCircle, IconArrowRight, IconCheck, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { ICON_CLASSES } from '../constants/color-classes';
import { getStatusAccentColor, getStatusSurfaceColor, getThemeColorValue } from '../utils/theme';

interface JoinKeyMapperProps {
  schemaComparison: SchemaComparisonResult;
  joinColumns: string[];
  joinKeyMappings: Record<string, string>;
  onJoinColumnsChange: (columns: string[]) => void;
  onMappingsChange: (mappings: Record<string, string>) => void;
}

export const JoinKeyMapper = ({
  schemaComparison,
  joinColumns,
  joinKeyMappings,
  onJoinColumnsChange,
  onMappingsChange,
}: JoinKeyMapperProps) => {
  const theme = useMantineTheme();
  const colorScheme = useAppTheme();
  const baseTextColor = getThemeColorValue(theme, 'text-primary', colorScheme === 'dark' ? 0 : 9);

  // Toggle between auto and custom mapping modes
  const [useCustomMapping, setUseCustomMapping] = useState(false);

  // For custom mode: track which Source A column is selected for mapping
  const [selectedKeyA, setSelectedKeyA] = useState<string | null>(null);

  // Search filters for custom mode
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');

  // Get all columns from both sources
  const columnsA = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInA.map((c) => c.name),
  ];

  const columnsB = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInB.map((c) => c.name),
  ];

  // Filter columns based on search (for custom mode)
  const filteredColumnsA = columnsA.filter((col) =>
    col.toLowerCase().includes(searchA.toLowerCase()),
  );
  const filteredColumnsB = columnsB.filter((col) =>
    col.toLowerCase().includes(searchB.toLowerCase()),
  );

  // Get suggested keys for auto mode (independent from custom mode selections)
  const { suggestedKeys } = schemaComparison;

  // Reverse mapping for checking if B column is already mapped
  const reverseMappings = Object.entries(joinKeyMappings).reduce(
    (acc, [keyA, keyB]) => {
      acc[keyB] = keyA;
      return acc;
    },
    {} as Record<string, string>,
  );

  // AUTO MODE: Handle toggling a join key from common columns
  const handleAutoToggle = (key: string) => {
    if (joinColumns.includes(key)) {
      // Remove
      onJoinColumnsChange(joinColumns.filter((k) => k !== key));
      // Remove mapping if exists
      const newMappings = { ...joinKeyMappings };
      delete newMappings[key];
      onMappingsChange(newMappings);
    } else {
      // Add
      onJoinColumnsChange([...joinColumns, key]);
    }
  };

  // CUSTOM MODE: Handle clicking Source A column
  const handleKeyAClick = (keyA: string) => {
    if (selectedKeyA === keyA) {
      setSelectedKeyA(null);
    } else {
      setSelectedKeyA(keyA);
    }
  };

  // CUSTOM MODE: Handle clicking Source B column
  const handleKeyBClick = (keyB: string) => {
    if (!selectedKeyA) return;

    const newJoinColumns = [...joinColumns];
    const newMappings = { ...joinKeyMappings };

    // Add to join columns if not already there
    if (!newJoinColumns.includes(selectedKeyA)) {
      newJoinColumns.push(selectedKeyA);
    }

    // Remove any existing mapping for this B column
    if (reverseMappings[keyB] && reverseMappings[keyB] !== selectedKeyA) {
      delete newMappings[reverseMappings[keyB]];
    }

    // If same name, don't create explicit mapping (auto)
    if (selectedKeyA === keyB) {
      delete newMappings[selectedKeyA];
    } else {
      newMappings[selectedKeyA] = keyB;
    }

    onJoinColumnsChange(newJoinColumns);
    onMappingsChange(newMappings);
    setSelectedKeyA(null);
  };

  // CUSTOM MODE: Remove a join key
  const handleRemoveKey = (keyA: string) => {
    onJoinColumnsChange(joinColumns.filter((k) => k !== keyA));
    const newMappings = { ...joinKeyMappings };
    delete newMappings[keyA];
    onMappingsChange(newMappings);
  };

  // Get the target B column for a join key (if mapped)
  const getTargetKey = (keyA: string): string => {
    return joinKeyMappings[keyA] || keyA;
  };

  // Toggle between auto and custom modes
  const handleModeToggle = (checked: boolean) => {
    setUseCustomMapping(checked);
    setSelectedKeyA(null);

    if (!checked) {
      // Switching to auto mode - keep only keys that can work in auto mode
      // (i.e., keys that exist in both sources with same name OR have valid mappings)
      const validAutoKeys = joinColumns.filter((keyA) => {
        const mappedKeyB = joinKeyMappings[keyA] || keyA;
        return columnsB.includes(mappedKeyB);
      });

      onJoinColumnsChange(validAutoKeys);
      // Keep existing mappings, they're still valid
    }
  };

  const hasJoinKeys = joinColumns.length > 0;

  // Render column item for custom mode
  const renderColumnItem = (
    col: string,
    side: 'A' | 'B',
    onClick: () => void,
    isSelected: boolean,
    isMapped: boolean,
    onRemove?: () => void,
  ) => {
    const isClickable = side === 'A' || selectedKeyA !== null;
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
      >
        <Group gap="xs" wrap="nowrap" onClick={isClickable ? onClick : undefined}>
          <Text size="sm" style={{ color: textColor, flex: 1 }}>
            {col}
          </Text>
          {onRemove && isMapped && (
            <IconX
              size={14}
              style={{
                cursor: 'pointer',
                color: getThemeColorValue(theme, 'text-secondary', colorScheme === 'dark' ? 3 : 6),
                flexShrink: 0,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            />
          )}
        </Group>
      </Paper>
    );
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={600}>
            Join Keys
          </Text>
          <Checkbox
            label="Custom mapping"
            checked={useCustomMapping}
            onChange={(e) => handleModeToggle(e.currentTarget.checked)}
          />
        </Group>

        {/* AUTO MODE */}
        <Collapse in={!useCustomMapping}>
          <Stack gap="md">
            {suggestedKeys.length > 0 ? (
              <Text size="xs" c="dimmed">
                Select suggested join keys (detected based on primary keys and common naming
                patterns)
              </Text>
            ) : (
              <Text size="xs" c="dimmed">
                No join keys auto-detected. Use custom mapping to define join keys manually.
              </Text>
            )}

            {/* Show only suggested keys (independent of custom mode) */}
            {suggestedKeys.length > 0 && (
              <Chip.Group multiple value={joinColumns}>
                <Group gap="xs">
                  {suggestedKeys.map((key) => {
                    const isSelected = joinColumns.includes(key);
                    const chipLabelStyles = isSelected
                      ? {
                          backgroundColor: getStatusSurfaceColor(theme, 'added', colorScheme),
                          color: getStatusAccentColor(theme, 'added', colorScheme),
                        }
                      : undefined;
                    const chipStyles = chipLabelStyles ? { label: chipLabelStyles } : undefined;

                    return (
                      <Chip
                        key={key}
                        value={key}
                        onChange={() => handleAutoToggle(key)}
                        variant="light"
                        styles={chipStyles}
                        icon={
                          isSelected ? (
                            <IconCheck size={12} className={ICON_CLASSES.success} />
                          ) : (
                            <IconCheck size={12} style={{ opacity: 0.5 }} />
                          )
                        }
                      >
                        {key}
                      </Chip>
                    );
                  })}
                </Group>
              </Chip.Group>
            )}

            {!hasJoinKeys && (
              <Alert
                color="background-tertiary"
                icon={<IconAlertCircle size={16} className="text-iconWarning-light" />}
              >
                <Text size="sm">
                  No join keys selected. Please select at least one column, or use custom mapping if
                  column names differ between sources.
                </Text>
              </Alert>
            )}
          </Stack>
        </Collapse>

        {/* CUSTOM MODE */}
        <Collapse in={useCustomMapping}>
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              Click a column in Source A, then click its match in Source B
            </Text>

            <Group align="flex-start" gap="md" wrap="nowrap">
              {/* Source A columns */}
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
                  <Stack gap="xs" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {filteredColumnsA.map((col) => {
                      const isSelected = selectedKeyA === col;
                      const isMapped = joinColumns.includes(col);
                      const targetKey = isMapped ? getTargetKey(col) : null;

                      return (
                        <Group key={col} gap="xs" wrap="nowrap">
                          <Box style={{ flex: 1 }}>
                            {renderColumnItem(
                              col,
                              'A',
                              () => handleKeyAClick(col),
                              isSelected,
                              isMapped,
                              () => handleRemoveKey(col),
                            )}
                          </Box>
                          {isMapped && targetKey && (
                            <Group gap={4} wrap="nowrap" style={{ flex: 1 }}>
                              <IconArrowRight size={14} style={{ color: baseTextColor }} />
                              <Text size="xs" fw={500} style={{ color: baseTextColor }}>
                                {targetKey}
                              </Text>
                            </Group>
                          )}
                        </Group>
                      );
                    })}
                  </Stack>
                </Stack>
              </Box>

              {/* Source B columns */}
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
                    disabled={!selectedKeyA}
                  />
                  <Stack gap="xs" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {filteredColumnsB.map((col) => {
                      const isMapped = !!reverseMappings[col];
                      return renderColumnItem(
                        col,
                        'B',
                        () => handleKeyBClick(col),
                        false,
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
