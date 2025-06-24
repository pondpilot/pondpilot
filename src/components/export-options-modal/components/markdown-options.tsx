import { Stack, Checkbox, Text, Radio, Group } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import { commonCheckboxClassNames } from '../constants';

interface MarkdownOptionsProps {
  includeHeader: boolean;
  setIncludeHeader: (value: boolean) => void;
  mdFormat: 'github' | 'standard';
  setMdFormat: (value: 'github' | 'standard') => void;
  alignColumns: boolean;
  setAlignColumns: (value: boolean) => void;
}

export function MarkdownOptions({
  includeHeader,
  setIncludeHeader,
  mdFormat,
  setMdFormat,
  alignColumns,
  setAlignColumns,
}: MarkdownOptionsProps) {
  return (
    <Stack gap="md">
      <Checkbox
        label="Include header row"
        checked={includeHeader}
        onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
        data-testid={setDataTestId('export-include-header')}
        color="background-accent"
        classNames={commonCheckboxClassNames}
      />
      <Stack gap={16}>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Markdown Format
          </Text>
          <Text size="xs" c="text-secondary">
            Use GitHub for best compatibility with GitHub and similar platforms; choose Standard for
            widest compatibility.
          </Text>
        </Stack>
        <Radio.Group
          value={mdFormat}
          onChange={(value) => setMdFormat(value as 'github' | 'standard')}
        >
          <Group gap="xl">
            <Radio
              value="github"
              label="GitHub"
              color="background-accent"
              classNames={{
                root: 'flex items-center',
                label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark ml-2',
              }}
            />
            <Radio
              value="standard"
              label="Standard"
              color="background-accent"
              classNames={{
                root: 'flex items-center',
                label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark ml-2',
              }}
            />
          </Group>
        </Radio.Group>
      </Stack>
      <Checkbox
        label="Align columns"
        checked={alignColumns}
        onChange={(e) => setAlignColumns(e.currentTarget.checked)}
        color="background-accent"
        classNames={commonCheckboxClassNames}
      />
    </Stack>
  );
}
