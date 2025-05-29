import { Stack, TextInput, Checkbox } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import { commonTextInputClassNames, commonCheckboxClassNames } from '../constants';

interface SqlOptionsProps {
  tableName: string;
  setTableName: (value: string) => void;
  tableNameError: string;
  includeCreateTable: boolean;
  setIncludeCreateTable: (value: boolean) => void;
  includeDataTypes: boolean;
  setIncludeDataTypes: (value: boolean) => void;
}

export function SqlOptions({
  tableName,
  setTableName,
  tableNameError,
  includeCreateTable,
  setIncludeCreateTable,
  includeDataTypes,
  setIncludeDataTypes,
}: SqlOptionsProps) {
  return (
    <Stack gap="md">
      <TextInput
        label="Table Name"
        value={tableName}
        onChange={(e) => setTableName(e.currentTarget.value)}
        data-testid={setDataTestId('export-sql-table-name')}
        error={tableNameError}
        size="md"
        classNames={commonTextInputClassNames}
      />
      <Checkbox
        label="Include CREATE TABLE statement"
        checked={includeCreateTable}
        onChange={(e) => setIncludeCreateTable(e.currentTarget.checked)}
        color="background-accent"
        classNames={commonCheckboxClassNames}
      />
      <Checkbox
        label="Include column data types"
        checked={includeDataTypes}
        onChange={(e) => setIncludeDataTypes(e.currentTarget.checked)}
        disabled={!includeCreateTable}
        color="background-accent"
        classNames={commonCheckboxClassNames}
      />
    </Stack>
  );
}
