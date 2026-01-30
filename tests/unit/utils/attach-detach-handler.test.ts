/* eslint-disable import/order -- Module-under-test import must come after jest.mock calls for proper mock hoisting */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';

// Mock setup - must be declared before jest.mock calls
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPersistPut = jest.fn<any>().mockResolvedValue(undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPersistDelete = jest.fn<any>().mockResolvedValue(undefined);
let mockStoreState: Record<string, unknown>;

jest.mock('@controllers/data-source/persist', () => ({
  persistPutDataSources: (...args: unknown[]) => mockPersistPut(...args),
  persistDeleteDataSource: (...args: unknown[]) => mockPersistDelete(...args),
}));

jest.mock('@store/app-store', () => ({
  useAppStore: {
    getState: () => mockStoreState,
  },
}));

// Deterministic IDs for assertions
let idCounter = 0;
jest.mock('@utils/data-source', () => {
  const actual = jest.requireActual('@utils/data-source') as Record<string, unknown>;
  return {
    ...actual,
    makePersistentDataSourceId: () => {
      idCounter += 1;
      return `test-id-${idCounter}` as PersistentDataSourceId;
    },
  };
});

// eslint-disable-next-line import/first -- Module-under-test import must come after jest.mock calls
import { handleAttachStatements, handleDetachStatements } from '@utils/attach-detach-handler';
// eslint-disable-next-line import/first
import { ClassifiedSQLStatement, SQLStatement, SQLStatementType } from '@utils/editor/sql';

function makeStatement(
  code: string,
  type: SQLStatement,
): ClassifiedSQLStatement {
  return {
    code,
    type,
    sqlType: SQLStatementType.DDL,
    needsTransaction: false,
    isAllowedInScript: true,
    isAllowedInSubquery: false,
    lineNumber: 1,
    statementIndex: 0,
  };
}

function makeContext(
  dataSources: Map<PersistentDataSourceId, AnyDataSource> = new Map(),
) {
  return {
    dataSources,
    updatedDataSources: new Map(dataSources),
    updatedMetadata: new Map<string, unknown>(),
  };
}

describe('attach-detach-handler', () => {
  beforeEach(() => {
    idCounter = 0;
    mockPersistPut.mockClear();
    mockPersistDelete.mockClear();
    mockStoreState = { _iDbConn: { fake: true } };
  });

  describe('handleAttachStatements', () => {
    it('should create an IcebergCatalog data source for Iceberg ATTACH', async () => {
      const statements = [
        makeStatement(
          "ATTACH 'my_warehouse' AS my_catalog (TYPE ICEBERG, ENDPOINT 'https://rest.example.com', SECRET my_secret)",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'iceberg-catalog',
        catalogAlias: 'my_catalog',
        warehouseName: 'my_warehouse',
        endpoint: 'https://rest.example.com',
        secretName: 'my_secret',
        authType: 'none',
        connectionState: 'connected',
      });
      expect(mockPersistPut).toHaveBeenCalledTimes(1);
    });

    it('should create a RemoteDB data source for remote URL ATTACH', async () => {
      const statements = [
        makeStatement(
          "ATTACH 'https://example.com/db.duckdb' AS remote_db",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'remote-db',
        url: 'https://example.com/db.duckdb',
        dbName: 'remote_db',
        connectionState: 'connected',
      });
      expect(mockPersistPut).toHaveBeenCalledTimes(1);
    });

    it('should not duplicate an Iceberg catalog with the same alias', async () => {
      const existingId = 'existing-ice-id' as PersistentDataSourceId;
      const existing = new Map<PersistentDataSourceId, AnyDataSource>([
        [
          existingId,
          {
            type: 'iceberg-catalog',
            id: existingId,
            catalogAlias: 'my_catalog',
            warehouseName: 'old_warehouse',
            endpoint: '',
            authType: 'none',
            connectionState: 'connected',
            attachedAt: 1000,
            secretName: '',
          },
        ],
      ]);
      const statements = [
        makeStatement(
          "ATTACH 'new_warehouse' AS my_catalog (TYPE ICEBERG, SECRET s)",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext(existing);

      await handleAttachStatements(statements, ctx);

      // Should still have exactly one entry
      expect(ctx.updatedDataSources.size).toBe(1);
      expect(mockPersistPut).not.toHaveBeenCalled();
    });

    it('should ignore non-ATTACH statements', async () => {
      const statements = [
        makeStatement('SELECT 1', SQLStatement.SELECT),
        makeStatement('CREATE TABLE foo (id INT)', SQLStatement.CREATE),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      expect(ctx.updatedDataSources.size).toBe(0);
      expect(mockPersistPut).not.toHaveBeenCalled();
    });

    it('should handle multiple ATTACH statements in one batch', async () => {
      const statements = [
        makeStatement(
          "ATTACH 'wh1' AS cat1 (TYPE ICEBERG, SECRET s1)",
          SQLStatement.ATTACH,
        ),
        makeStatement(
          "ATTACH 'https://example.com/db.duckdb' AS remote_db",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      expect(ctx.updatedDataSources.size).toBe(2);
      expect(mockPersistPut).toHaveBeenCalledTimes(2);
    });

    it('should not persist when _iDbConn is null', async () => {
      mockStoreState = { _iDbConn: null };
      const statements = [
        makeStatement(
          "ATTACH 'wh' AS cat (TYPE ICEBERG, SECRET s)",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      // Data source should still be added to the map
      expect(ctx.updatedDataSources.size).toBe(1);
      // But persist should not be called
      expect(mockPersistPut).not.toHaveBeenCalled();
    });
  });

  describe('handleDetachStatements', () => {
    it('should remove a remote-db data source by dbName', async () => {
      const dbId = 'remote-id' as PersistentDataSourceId;
      const existing = new Map<PersistentDataSourceId, AnyDataSource>([
        [
          dbId,
          {
            type: 'remote-db',
            id: dbId,
            url: 'https://example.com/db.duckdb',
            dbName: 'remote_db',
            dbType: 'duckdb',
            connectionState: 'connected',
            attachedAt: 1000,
          },
        ],
      ]);
      const statements = [
        makeStatement('DETACH remote_db', SQLStatement.DETACH),
      ];
      const ctx = makeContext(existing);

      await handleDetachStatements(statements, ctx);

      expect(ctx.updatedDataSources.size).toBe(0);
      expect(mockPersistDelete).toHaveBeenCalledTimes(1);
    });

    it('should remove an iceberg-catalog data source by catalogAlias', async () => {
      const catId = 'ice-id' as PersistentDataSourceId;
      const existing = new Map<PersistentDataSourceId, AnyDataSource>([
        [
          catId,
          {
            type: 'iceberg-catalog',
            id: catId,
            catalogAlias: 'my_catalog',
            warehouseName: 'wh',
            endpoint: '',
            authType: 'none',
            connectionState: 'connected',
            attachedAt: 1000,
            secretName: '',
          },
        ],
      ]);
      const statements = [
        makeStatement('DETACH my_catalog', SQLStatement.DETACH),
      ];
      const ctx = makeContext(existing);

      await handleDetachStatements(statements, ctx);

      expect(ctx.updatedDataSources.size).toBe(0);
      expect(mockPersistDelete).toHaveBeenCalledTimes(1);
    });

    it('should remove an attached-db data source by dbName', async () => {
      const dbId = 'local-id' as PersistentDataSourceId;
      const existing = new Map<PersistentDataSourceId, AnyDataSource>([
        [
          dbId,
          {
            type: 'attached-db',
            id: dbId,
            dbType: 'duckdb',
            dbName: 'local_db',
            fileSourceId: '' as any,
          },
        ],
      ]);
      const statements = [
        makeStatement('DETACH local_db', SQLStatement.DETACH),
      ];
      const ctx = makeContext(existing);

      await handleDetachStatements(statements, ctx);

      expect(ctx.updatedDataSources.size).toBe(0);
      expect(mockPersistDelete).toHaveBeenCalledTimes(1);
    });

    it('should ignore non-DETACH statements', async () => {
      const statements = [
        makeStatement('SELECT 1', SQLStatement.SELECT),
      ];
      const ctx = makeContext();

      await handleDetachStatements(statements, ctx);

      expect(mockPersistDelete).not.toHaveBeenCalled();
    });

    it('should handle DETACH of non-existent database gracefully', async () => {
      const statements = [
        makeStatement('DETACH nonexistent', SQLStatement.DETACH),
      ];
      const ctx = makeContext();

      await handleDetachStatements(statements, ctx);

      expect(mockPersistDelete).not.toHaveBeenCalled();
    });
  });
});
