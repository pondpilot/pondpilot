import { useEditorPreferences } from '@hooks/use-editor-preferences';
import { Stack, Box, Title, Text, Switch, Group, Slider, SegmentedControl } from '@mantine/core';

import { SqlPreview } from './sql-preview';

const FONT_WEIGHT_OPTIONS = [
  { label: 'Light', value: 'light', weight: 300 },
  { label: 'Regular', value: 'regular', weight: 400 },
  { label: 'SemiBold', value: 'semibold', weight: 600 },
  { label: 'Bold', value: 'bold', weight: 700 },
];

export const EditorSettings = () => {
  const { preferences, updatePreference } = useEditorPreferences();

  const fontWeightData = FONT_WEIGHT_OPTIONS.map((item) => ({
    ...item,
    label: (
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: item.weight,
        }}
      >
        {item.label}
      </span>
    ),
  }));

  return (
    <Stack className="gap-8">
      <Box>
        <Group align="flex-start" justify="space-between">
          <Box className="flex-1 max-w-md">
            <Text c="text-primary" size="sm" fw={500} mb="xs">
              Text Size
            </Text>
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="text-primary">
                Aa
              </Text>
              <Text size="lg" c="text-primary">
                Aa
              </Text>
            </Group>
            <Slider
              value={preferences.fontSize}
              onChange={(value) => updatePreference('fontSize', value)}
              min={0.4}
              max={2}
              step={0.1}
              label={(value) => `${Math.round(value * 16)}`}
            />
            <Stack mt="xl">
              <Text c="text-primary" size="sm" fw={500}>
                Text Style
              </Text>
              <SegmentedControl
                value={preferences.fontWeight}
                onChange={(value) => updatePreference('fontWeight', value as any)}
                data={fontWeightData}
              />
            </Stack>
          </Box>
          <SqlPreview fontSize={preferences.fontSize} fontWeight={preferences.fontWeight} />
        </Group>
      </Box>
      <Box>
        <Title c="text-primary" order={3}>
          SQL Formatting
        </Title>
        <Stack>
          <Text c="text-secondary" size="sm">
            Configure how SQL queries are formatted in the editor.
          </Text>
          <Group justify="space-between" className="max-w-md">
            <Box>
              <Text c="text-primary" size="sm" fw={500}>
                Format on run
              </Text>
              <Text c="text-secondary" size="xs">
                Automatically format SQL queries before execution
              </Text>
            </Box>
            <Switch
              checked={preferences.formatOnRun}
              onChange={(event) => updatePreference('formatOnRun', event.currentTarget.checked)}
              size="md"
            />
          </Group>
        </Stack>
      </Box>
    </Stack>
  );
};
