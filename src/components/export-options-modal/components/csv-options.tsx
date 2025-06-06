import { Stack, TextInput, Checkbox } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import { commonTextInputClassNames, commonCheckboxClassNames } from '../constants';

interface CsvOptionsProps {
  includeHeader: boolean;
  setIncludeHeader: (value: boolean) => void;
  delimiter: string;
  setDelimiter: (value: string) => void;
  delimiterError: string;
  quoteChar: string;
  setQuoteChar: (value: string) => void;
  quoteCharError: string;
  escapeChar: string;
  setEscapeChar: (value: string) => void;
  escapeCharError: string;
}

export function CsvOptions({
  includeHeader,
  setIncludeHeader,
  delimiter,
  setDelimiter,
  delimiterError,
  quoteChar,
  setQuoteChar,
  quoteCharError,
  escapeChar,
  setEscapeChar,
  escapeCharError,
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
        size="md"
        classNames={commonTextInputClassNames}
      />
      <TextInput
        label="Quote Character"
        value={quoteChar}
        onChange={(e) => setQuoteChar(e.currentTarget.value)}
        error={quoteCharError}
        data-testid={setDataTestId('export-csv-quote-char')}
        size="md"
        classNames={commonTextInputClassNames}
      />
      <TextInput
        label="Escape Character"
        value={escapeChar}
        onChange={(e) => setEscapeChar(e.currentTarget.value)}
        data-testid={setDataTestId('export-csv-escape-char')}
        error={escapeCharError}
        size="md"
        classNames={commonTextInputClassNames}
      />
    </Stack>
  );
}
