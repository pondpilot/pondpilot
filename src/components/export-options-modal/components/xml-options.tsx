import { Stack, TextInput, Checkbox } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

interface XmlOptionsProps {
  includeHeader: boolean;
  setIncludeHeader: (value: boolean) => void;
  rootElement: string;
  setRootElement: (value: string) => void;
  rootElementError: string;
  rowElement: string;
  setRowElement: (value: string) => void;
  rowElementError: string;
}

export function XmlOptions({
  includeHeader,
  setIncludeHeader,
  rootElement,
  setRootElement,
  rootElementError,
  rowElement,
  setRowElement,
  rowElementError,
}: XmlOptionsProps) {
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
        label="Root Element Name"
        value={rootElement}
        onChange={(e) => setRootElement(e.currentTarget.value)}
        data-testid={setDataTestId('export-xml-root')}
        error={rootElementError}
      />
      <TextInput
        label="Row Element Name"
        value={rowElement}
        onChange={(e) => setRowElement(e.currentTarget.value)}
        data-testid={setDataTestId('export-xml-row')}
        error={rowElementError}
      />
    </Stack>
  );
}
