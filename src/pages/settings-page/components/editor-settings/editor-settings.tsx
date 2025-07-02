import { useEditorPreferences } from '@hooks/use-editor-preferences';
import { Stack, Box, Title, Text, Switch, Group } from '@mantine/core';

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
      </Stack>
    </Stack>
  );
};
