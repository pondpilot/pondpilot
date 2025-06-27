import { Stack, TextInput, Checkbox } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import { commonTextInputClassNames, commonCheckboxClassNames } from '../constants';

interface CsvOptionsProps {
  includeHeader: boolean;
  setIncludeHeader: (value: boolean) => void;
  delimiter: string;
  setDelimiter: (value: string) => void;
  delimiterError: string;
}

export function CsvOptions({
  includeHeader,
  setIncludeHeader,
  delimiter,
  setDelimiter,
  delimiterError,
}: CsvOptionsProps) {
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
      <TextInput
        label="Delimiter"
        value={delimiter}
        onChange={(e) => setDelimiter(e.currentTarget.value)}
        data-testid={setDataTestId('export-csv-delimiter')}
        error={delimiterError}
        classNames={commonTextInputClassNames}
      />
    </Stack>
  );
}
