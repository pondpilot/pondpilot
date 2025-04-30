import { mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as dataViewTest } from '../fixtures/data-view';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

test('Decimals are displayed corretly', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
    select
      sum(col1) as col1,
      0.5 as col2,
      (-123.123)::DECIMAL(10,2) as col3,
      1::INT128 as col4
    from (
      select 1 as col1
      union select 2 as col1
    )
  `);
  await runScript();
  await assertDataTableMatches({
    data: [[3, 0.5, -123.12, 1]],
    columnNames: ['col1', 'col2', 'col3', 'col4'],
  });
});

test('Display columns with duplicate names', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
   SELECT
    'col 1' AS column_name,
    'col 2' AS column_name,
    'col 3' AS column_name_1;
  `);
  await runScript();
  await assertDataTableMatches({
    data: [['col 1', 'col 2', 'col 3']],
    columnNames: ['column_name', 'column_name', 'column_name_1'],
  });
});

const tzOffset = new Date('2023-01-15 14:30:00').getTimezoneOffset();
const tzSign = tzOffset <= 0 ? '+' : '-';
const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');

test('Display all major data types and nulls', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
    SELECT
      42 AS int_val,
      9223372036854775807 AS bigint_val,
      123.45 AS double_val,
      'hello' AS string_val,
      TRUE AS bool_val,
      DATE '2023-01-15' AS date_val,
      TIME '14:30:00' AS time_val,
      TIMETZ '14:30:00+01:00' AS timetz_val,
      TIMESTAMP '2023-01-15 14:30:00' AS timestamp_val,
      TIMESTAMPTZ '2023-01-15 14:30:00+01:00' AS timestamptz_val,
      TIMESTAMP '2023-01-15 14:30:00.123' AS timestamp_ms_val,
      TIMESTAMPTZ '2023-01-15 14:30:00.456+01:00' AS timestamptz_ms_val,
      'hello'::BLOB AS blob_str_val,
      '\\x01\\xAC'::BLOB AS blob_val,
      '0101'::BITSTRING AS bitstring_val,
      INTERVAL 1 YEAR AS interval_val,
      123.456::DECIMAL(10,3) AS decimal_val,
      UUID '550e8400-e29b-41d4-a716-446655440000' AS uuid_val,
      {'x': 1, 'y': 2} AS struct_val,
      [1, 2, 3] AS array_val
    UNION ALL
    SELECT
      NULL AS int_val,
      NULL AS bigint_val,
      NULL AS double_val,
      NULL AS string_val,
      NULL AS bool_val,
      NULL AS date_val,
      NULL AS time_val,
      NULL AS timetz_val,
      NULL AS timestamp_val,
      NULL AS timestamptz_val,
      NULL AS timestamp_ms_val,
      NULL AS timestamptz_ms_val,
      NULL AS blob_str_val,
      NULL AS blob_val,
      NULL AS bitstring_val,
      NULL AS interval_val,
      NULL AS decimal_val,
      NULL AS uuid_val,
      NULL AS struct_val,
      NULL AS array_val
  `);
  await runScript();
  await assertDataTableMatches({
    data: [
      [
        '42',
        '9,223,372,036,854,775,807',
        '123.45',
        'hello',
        'true',
        '2023-01-15',
        '14:30:00',
        '14:30:00', // timetz are not supported by arrow!
        '2023-01-15 14:30:00',
        `${new Date('2023-01-15T14:30:00+01:00')
          .toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })
          .replace(/(\d+)\/(\d+)\/(\d+), /, '$3-$1-$2 ')}${tzSign}${tzHours}`,
        '2023-01-15 14:30:00.123',
        `${new Date('2023-01-15T14:30:00.456+01:00')
          .toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            fractionalSecondDigits: 3,
          })
          .replace(/(\d+)\/(\d+)\/(\d+), /, '$3-$1-$2 ')}${tzSign}${tzHours}`,
        'hello', // blob is shown as string if it is an UTF8 string
        '\\x01\\xAC', // blob is shown as hex if not an UTF8 string
        // bitstrings come as binary from arrow. Util we fetch types using metadata
        // query, we rely on arrow types, so this will show as hex
        '\\x04\\xF5',
        'Interval not supported by duckdb-wasm yet',
        '123.456',
        '550e8400-e29b-41d4-a716-446655440000',
        '{"x":1,"y":2}',
        '[1,2,3]',
      ],
      [
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
        'NULL',
      ],
    ],
    columnNames: [
      'int_val',
      'bigint_val',
      'double_val',
      'string_val',
      'bool_val',
      'date_val',
      'time_val',
      'timetz_val',
      'timestamp_val',
      'timestamptz_val',
      'timestamp_ms_val',
      'timestamptz_ms_val',
      'blob_str_val',
      'blob_val',
      'bitstring_val',
      'interval_val',
      'decimal_val',
      'uuid_val',
      'struct_val',
      'array_val',
    ],
  });
});
