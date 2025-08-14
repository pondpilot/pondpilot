import { Stack, Checkbox } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

interface TsvOptionsProps {
  includeHeader: boolean;
  setIncludeHeader: (value: boolean) => void;
}

export function TsvOptions({ includeHeader, setIncludeHeader }: TsvOptionsProps) {
  return (
    <Stack gap="md">
      <Checkbox
        label="Include header row"
        checked={includeHeader}
        onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
        data-testid={setDataTestId('export-include-header')}
        color="background-accent"
      />
    </Stack>
  );
}
