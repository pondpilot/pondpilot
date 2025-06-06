import { Stack, Text, UnstyledButton } from '@mantine/core';
import { ExportFormat } from '@models/export-options';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

import { formatOptions } from '../constants';

interface FormatSelectorProps {
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
}

export function FormatSelector({ format, onFormatChange }: FormatSelectorProps) {
  return (
    <Stack gap={4} w={140}>
      {formatOptions.map((option) => (
        <UnstyledButton
          key={option.value}
          onClick={() => onFormatChange(option.value as ExportFormat)}
          className={cn(
            'px-4 py-2.5 rounded-full transition-colors text-sm font-medium text-left',
            format === option.value
              ? 'bg-transparentBrandBlue-016 dark:bg-transparentBrandBlue-016 text-textPrimary-light dark:text-textPrimary-dark'
              : 'hover:bg-transparent004 hover:dark:bg-transparent004 text-textSecondary-light dark:text-textSecondary-dark',
          )}
          data-testid={setDataTestId(`export-format-${option.value}`)}
        >
          <Text c="text-secondary">{option.label}</Text>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
