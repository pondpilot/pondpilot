import { Stack, TextInput, Checkbox } from '@mantine/core';

import {
  commonTextInputClassNames,
  commonCheckboxClassNames,
} from '@components/export-options-modal/constants';
import { setDataTestId } from '@utils/test-id';

interface TsvOptionsProps {
  includeHeader: boolean;
  setIncludeHeader: (value: boolean) => void;
  quoteChar: string;
  setQuoteChar: (value: string) => void;
  quoteCharError: string;
  escapeChar: string;
  setEscapeChar: (value: string) => void;
  escapeCharError: string;
}

export function TsvOptions({
  includeHeader,
  setIncludeHeader,
  quoteChar,
  setQuoteChar,
  quoteCharError,
  escapeChar,
  setEscapeChar,
  escapeCharError,
}: TsvOptionsProps) {
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
        label="Quote Character"
        value={quoteChar}
        onChange={(e) => setQuoteChar(e.currentTarget.value)}
        data-testid={setDataTestId('export-tsv-quote-char')}
        error={quoteCharError}
        size="md"
        classNames={commonTextInputClassNames}
      />
      <TextInput
        label="Escape Character"
        value={escapeChar}
        onChange={(e) => setEscapeChar(e.currentTarget.value)}
        data-testid={setDataTestId('export-tsv-escape-char')}
        error={escapeCharError}
        size="md"
        classNames={commonTextInputClassNames}
      />
    </Stack>
  );
}
