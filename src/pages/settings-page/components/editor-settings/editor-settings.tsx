import { useEditorPreferences } from '@hooks/use-editor-preferences';
import { Stack, Box, Title, Text, Switch, Group, Slider } from '@mantine/core';

export const EditorSettings = () => {
  const { preferences, updatePreference } = useEditorPreferences();

  return (
    <Stack className="gap-8">
      <Title c="text-primary" order={2}>
        Editor
      </Title>
      <Stack>
        <Box>
          <Title c="text-primary" order={3}>
            SQL Formatting
          </Title>
          <Stack>
            <Text c="text-secondary">Configure how SQL queries are formatted in the editor.</Text>
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
        <Box>
          <Title c="text-primary" order={3}>
            Appearance
          </Title>
          <Stack>
            <Text c="text-secondary">Customize the appearance of the code editor.</Text>
            <Box className="max-w-md">
              <Text c="text-primary" size="sm" fw={500} mb="xs">
                Font size
              </Text>
              <Text c="text-secondary" size="xs" mb="sm">
                Adjust the font size of the code editor ({Math.floor(preferences.fontSize * 100)}%)
              </Text>
              <Slider
                value={preferences.fontSize}
                onChange={(value) => updatePreference('fontSize', value)}
                min={0.4}
                max={2}
                step={0.1}
                marks={[
                  { value: 0.5, label: '50%' },
                  { value: 1, label: '100%' },
                  { value: 1.5, label: '150%' },
                  { value: 2, label: '200%' },
                ]}
              />
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
};
