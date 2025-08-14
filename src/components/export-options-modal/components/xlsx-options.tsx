import { Stack, TextInput, Checkbox } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

interface XlsxOptionsProps {
  includeHeader: boolean;
  setIncludeHeader: (value: boolean) => void;
  sheetName: string;
  setSheetName: (value: string) => void;
  sheetNameError: string;
}

export function XlsxOptions({
  includeHeader,
  setIncludeHeader,
  sheetName,
  setSheetName,
  sheetNameError,
}: XlsxOptionsProps) {
  return (
    <Stack gap="md">
      <Checkbox
        label="Include header row"
        checked={includeHeader}
        onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
        data-testid={setDataTestId('export-include-header')}
        color="background-accent"
      />
      <TextInput
        label="Sheet Name"
        value={sheetName}
        onChange={(e) => setSheetName(e.currentTarget.value)}
        data-testid={setDataTestId('export-xlsx-sheet-name')}
        error={sheetNameError}
      />
    </Stack>
  );
}
