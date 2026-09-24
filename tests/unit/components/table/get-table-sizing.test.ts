import { getTableSizing, sanitizeColumnSizeCache } from '@components/table/utils/get-table-sizing';
import { describe, expect, it } from '@jest/globals';
import { Header } from '@tanstack/react-table';

const createHeader = (index: number, columnId: string, size: number) =>
  ({
    index,
    getSize: () => size,
    column: {
      id: columnId,
      getSize: () => size,
    },
  }) as Header<any, unknown>;

describe('getTableSizing', () => {
  it('uses indexes for CSS variables and stable column IDs for persistence', () => {
    const sizing = getTableSizing([
      createHeader(0, '__index__', 46),
      createHeader(1, '0_column_name', 320),
      createHeader(2, '1_column_name', 180),
    ]);

    expect(sizing.columnSizeVars).toEqual({
      '--header-0-size': 46,
      '--col-0-size': 46,
      '--header-1-size': 320,
      '--col-1-size': 320,
      '--header-2-size': 180,
      '--col-2-size': 180,
    });
    expect(sizing.persistedColumnSizes).toEqual({
      __index__: 46,
      '0_column_name': 320,
      '1_column_name': 180,
    });
  });
});

describe('sanitizeColumnSizeCache', () => {
  it('keeps stable column IDs and rejects legacy numeric or invalid entries', () => {
    expect(
      sanitizeColumnSizeCache({
        0: 999,
        message: 320,
        message_2: 180,
        invalid: Number.NaN,
        negative: -20,
      }),
    ).toEqual({ message: 320, message_2: 180 });
  });
});
