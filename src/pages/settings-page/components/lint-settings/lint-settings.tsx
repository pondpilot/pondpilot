import { useEditorPreferences } from '@hooks/use-editor-preferences';
import { Badge, Group, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import type { LintSeverityFilter } from '@store/editor-preferences';
import { IconX } from '@tabler/icons-react';

const SEVERITY_FILTER_OPTIONS = [
  { label: 'Errors only', value: 'errors' },
  { label: 'Errors & Warnings', value: 'errors-warnings' },
  { label: 'All', value: 'all' },
];

export const LintSettings = () => {
  const { preferences, updatePreference } = useEditorPreferences();

  const handleRemoveDisabledRule = (rule: string) => {
    updatePreference(
      'lintDisabledRules',
      preferences.lintDisabledRules.filter((r) => r !== rule),
    );
  };

  return (
    <Stack className="gap-4">
      <Group justify="space-between" className="max-w-md">
        <div>
          <Text c="text-primary" size="sm" fw={500}>
            Enable SQL linting
          </Text>
          <Text c="text-secondary" size="xs">
            Show lint warnings and suggestions in the SQL editor
          </Text>
        </div>
        <Switch
          checked={preferences.lintEnabled}
          onChange={(event) => updatePreference('lintEnabled', event.currentTarget.checked)}
          size="md"
          data-testid="lint-toggle"
        />
      </Group>

      {preferences.lintEnabled && (
        <Stack className="gap-4 max-w-md">
          <div>
            <Text c="text-primary" size="sm" fw={500} mb="xs">
              Severity filter
            </Text>
            <SegmentedControl
              value={preferences.lintSeverityFilter}
              onChange={(value) => updatePreference('lintSeverityFilter', value as LintSeverityFilter)}
              data={SEVERITY_FILTER_OPTIONS}
              data-testid="lint-severity-filter"
            />
          </div>
        </Stack>
      )}

      {preferences.lintDisabledRules.length > 0 && (
        <div>
          <Text c="text-primary" size="sm" fw={500} mb="xs">
            Disabled rules
          </Text>
          <Text c="text-secondary" size="xs" mb="sm">
            These rules are suppressed. Click to re-enable.
          </Text>
          <Group gap="xs" data-testid="lint-disabled-rules">
            {preferences.lintDisabledRules.map((rule) => (
              <Badge
                key={rule}
                variant="light"
                color="gray"
                rightSection={
                  <IconX
                    size={12}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleRemoveDisabledRule(rule)}
                    data-testid={`lint-remove-rule-${rule}`}
                  />
                }
              >
                {rule}
              </Badge>
            ))}
          </Group>
        </div>
      )}
    </Stack>
  );
};
