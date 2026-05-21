import { describe, expect, it, jest } from '@jest/globals';
import { attachAndVerifyIcebergCatalog } from '@utils/iceberg-catalog';

describe('iceberg-catalog utils', () => {
  it('removes global replay registration when attach verification fails', async () => {
    const pool = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('duckdb_databases')) {
          return { numRows: 0, toArray: () => [] };
        }
        return { numRows: 0, toArray: () => [] };
      }),
      registerGlobalAttach: jest.fn(),
      registerGlobalDetach: jest.fn(),
    };

    await expect(
      attachAndVerifyIcebergCatalog({
        pool: pool as any,
        secretName: 'iceberg_secret',
        catalogAlias: 'iceberg_db',
        warehouseName: 'warehouse',
        credentials: {
          authType: 'bearer',
          token: 'token',
        },
        settleDelayMs: 0,
        maxVerifyAttempts: 1,
      }),
    ).rejects.toThrow('could not be verified');

    expect(pool.registerGlobalAttach).toHaveBeenCalledWith(
      'iceberg_db',
      expect.stringContaining('ATTACH'),
      [expect.stringContaining('CREATE OR REPLACE SECRET')],
    );
    expect(pool.registerGlobalDetach).toHaveBeenCalledWith('iceberg_db');
  });
});
