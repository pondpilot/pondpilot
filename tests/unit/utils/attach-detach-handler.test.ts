/* eslint-disable import/order -- Module-under-test import must come after jest.mock calls for proper mock hoisting */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import type { SecretId } from '@services/secret-store';
import type { SecretMappingEntry } from '@utils/attach-detach-handler';

// Mock setup - must be declared before jest.mock calls
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPersistPut = jest.fn<any>().mockResolvedValue(undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPersistDelete = jest.fn<any>().mockResolvedValue(undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPutSecret = jest.fn<any>().mockResolvedValue(undefined);
let mockSecretIdCounter = 0;
let mockStoreState: Record<string, unknown>;

jest.mock('@services/secret-store', () => ({
  putSecret: (...args: unknown[]) => mockPutSecret(...args),
  makeSecretId: () => {
    mockSecretIdCounter += 1;
    return `test-secret-id-${mockSecretIdCounter}`;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteSecret: jest.fn<any>().mockResolvedValue(undefined),
}));

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
import {
  handleAttachStatements,
  handleCreateSecretStatements,
  handleDetachStatements,
  persistSecretMappingEntries,
} from '@utils/attach-detach-handler';
// eslint-disable-next-line import/first
import { ClassifiedSQLStatement, SQLStatement, SQLStatementType } from '@utils/editor/sql';

function makeStatement(code: string, type: SQLStatement): ClassifiedSQLStatement {
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

function makeContext(dataSources: Map<PersistentDataSourceId, AnyDataSource> = new Map()) {
  return {
    dataSources,
    updatedDataSources: new Map(dataSources),
    updatedMetadata: new Map<string, unknown>(),
  };
}

describe('attach-detach-handler', () => {
  beforeEach(() => {
    idCounter = 0;
    mockSecretIdCounter = 0;
    mockPersistPut.mockClear();
    mockPersistDelete.mockClear();
    mockPutSecret.mockClear();
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
        makeStatement("ATTACH 'https://example.com/db.duckdb' AS remote_db", SQLStatement.ATTACH),
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
        makeStatement("ATTACH 'wh1' AS cat1 (TYPE ICEBERG, SECRET s1)", SQLStatement.ATTACH),
        makeStatement("ATTACH 'https://example.com/db.duckdb' AS remote_db", SQLStatement.ATTACH),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      expect(ctx.updatedDataSources.size).toBe(2);
      expect(mockPersistPut).toHaveBeenCalledTimes(2);
    });

    it('should infer s3 secret for S3_TABLES endpoint when no explicit SECRET', async () => {
      const secretId = 'secret-ref-1' as unknown as SecretId;
      const secretMapping = new Map<string, SecretMappingEntry>([
        ['my_s3_secret', { secretRef: secretId, secretType: 's3', authType: 'sigv4' }],
      ]);
      const statements = [
        makeStatement(
          "CREATE OR REPLACE SECRET my_s3_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey', REGION 'us-east-1')",
          SQLStatement.CREATE,
        ),
        makeStatement(
          "ATTACH IF NOT EXISTS 'my_warehouse' AS my_catalog (TYPE ICEBERG, ENDPOINT_TYPE 's3_tables')",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx, secretMapping);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'iceberg-catalog',
        catalogAlias: 'my_catalog',
        secretName: 'my_s3_secret',
        secretRef: secretId,
        authType: 'sigv4',
      });
    });

    it('should infer s3 secret for GLUE endpoint when no explicit SECRET', async () => {
      const secretId = 'secret-ref-2' as unknown as SecretId;
      const secretMapping = new Map<string, SecretMappingEntry>([
        ['glue_secret', { secretRef: secretId, secretType: 's3', authType: 'sigv4' }],
      ]);
      const statements = [
        makeStatement(
          "CREATE OR REPLACE SECRET glue_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey')",
          SQLStatement.CREATE,
        ),
        makeStatement(
          "ATTACH 'my_warehouse' AS glue_cat (TYPE ICEBERG, ENDPOINT_TYPE 'GLUE')",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx, secretMapping);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'iceberg-catalog',
        catalogAlias: 'glue_cat',
        secretName: 'glue_secret',
        secretRef: secretId,
        authType: 'sigv4',
      });
    });

    it('should not infer secret when secret type does not match endpoint', async () => {
      const secretId = 'secret-ref-3' as unknown as SecretId;
      const secretMapping = new Map<string, SecretMappingEntry>([
        ['ice_secret', { secretRef: secretId, secretType: 'iceberg', authType: 'bearer' }],
      ]);
      const statements = [
        makeStatement(
          "CREATE OR REPLACE SECRET ice_secret (TYPE iceberg, TOKEN 'tok123')",
          SQLStatement.CREATE,
        ),
        makeStatement(
          "ATTACH 'my_warehouse' AS my_cat (TYPE ICEBERG, ENDPOINT_TYPE 's3_tables')",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx, secretMapping);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'iceberg-catalog',
        secretName: '',
        secretRef: undefined,
      });
    });

    it('should not infer secret when multiple CREATE SECRETs exist in batch', async () => {
      const secretMapping = new Map<string, SecretMappingEntry>([
        [
          'secret_a',
          { secretRef: 'ref-a' as unknown as SecretId, secretType: 's3', authType: 'sigv4' },
        ],
        [
          'secret_b',
          { secretRef: 'ref-b' as unknown as SecretId, secretType: 's3', authType: 'sigv4' },
        ],
      ]);
      const statements = [
        makeStatement(
          "CREATE SECRET secret_a (TYPE s3, KEY_ID 'A', SECRET 'a')",
          SQLStatement.CREATE,
        ),
        makeStatement(
          "CREATE SECRET secret_b (TYPE s3, KEY_ID 'B', SECRET 'b')",
          SQLStatement.CREATE,
        ),
        makeStatement(
          "ATTACH 'wh' AS cat (TYPE ICEBERG, ENDPOINT_TYPE 's3_tables')",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx, secretMapping);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'iceberg-catalog',
        secretName: '',
        secretRef: undefined,
      });
    });

    it('should still use explicit SECRET option (regression)', async () => {
      const secretId = 'explicit-ref' as unknown as SecretId;
      const secretMapping = new Map<string, SecretMappingEntry>([
        ['explicit_secret', { secretRef: secretId, secretType: 's3', authType: 'sigv4' }],
      ]);
      const statements = [
        makeStatement(
          "CREATE SECRET explicit_secret (TYPE s3, KEY_ID 'A', SECRET 'a')",
          SQLStatement.CREATE,
        ),
        makeStatement(
          "ATTACH 'wh' AS cat (TYPE ICEBERG, SECRET explicit_secret, ENDPOINT_TYPE 's3_tables')",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx, secretMapping);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'iceberg-catalog',
        secretName: 'explicit_secret',
        secretRef: secretId,
        authType: 'sigv4',
      });
    });

    it('should not infer when batch has no CREATE SECRET at all', async () => {
      const statements = [
        makeStatement(
          "ATTACH 'wh' AS cat (TYPE ICEBERG, ENDPOINT_TYPE 's3_tables')",
          SQLStatement.ATTACH,
        ),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      const created = Array.from(ctx.updatedDataSources.values());
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type: 'iceberg-catalog',
        secretName: '',
        secretRef: undefined,
      });
    });

    it('should not persist when _iDbConn is null', async () => {
      mockStoreState = { _iDbConn: null };
      const statements = [
        makeStatement("ATTACH 'wh' AS cat (TYPE ICEBERG, SECRET s)", SQLStatement.ATTACH),
      ];
      const ctx = makeContext();

      await handleAttachStatements(statements, ctx);

      // Data source should still be added to the map
      expect(ctx.updatedDataSources.size).toBe(1);
      // But persist should not be called
      expect(mockPersistPut).not.toHaveBeenCalled();
    });
  });

  describe('handleCreateSecretStatements', () => {
    it('should parse CREATE SECRET into mapping without persisting', async () => {
      const statements = [
        makeStatement(
          "CREATE SECRET my_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey', REGION 'us-east-1')",
          SQLStatement.CREATE,
        ),
      ];

      const mapping = await handleCreateSecretStatements(statements);

      expect(mapping.size).toBe(1);
      expect(mapping.has('my_secret')).toBe(true);
      // Secrets are not persisted until consumed by an ATTACH via persistSecretMappingEntries
      expect(mockPutSecret).not.toHaveBeenCalled();
      // Credential data is held in-memory for deferred persistence
      expect(mapping.get('my_secret')?.data).toEqual(
        expect.objectContaining({ awsKeyId: 'AKID', awsSecret: 'skey' }),
      );
    });

    it('should skip non-CREATE statements', async () => {
      const statements = [makeStatement('SELECT 1', SQLStatement.SELECT)];

      const mapping = await handleCreateSecretStatements(statements);

      expect(mapping.size).toBe(0);
      expect(mockPutSecret).not.toHaveBeenCalled();
    });

    it('should derive sigv4 auth type for s3 secret type', async () => {
      const statements = [
        makeStatement(
          "CREATE SECRET aws_creds (TYPE s3, KEY_ID 'AKID', SECRET 'skey')",
          SQLStatement.CREATE,
        ),
      ];

      const mapping = await handleCreateSecretStatements(statements);

      const entry = mapping.get('aws_creds');
      expect(entry?.authType).toBe('sigv4');
      expect(entry?.secretType).toBe('s3');
    });

    it('should derive oauth2 auth type when CLIENT_ID present', async () => {
      const statements = [
        makeStatement(
          "CREATE SECRET oauth_creds (TYPE iceberg, CLIENT_ID 'cid', CLIENT_SECRET 'csec')",
          SQLStatement.CREATE,
        ),
      ];

      const mapping = await handleCreateSecretStatements(statements);

      const entry = mapping.get('oauth_creds');
      expect(entry?.authType).toBe('oauth2');
    });

    it('should derive bearer auth type when TOKEN present', async () => {
      const statements = [
        makeStatement(
          "CREATE SECRET token_creds (TYPE iceberg, TOKEN 'tok123')",
          SQLStatement.CREATE,
        ),
      ];

      const mapping = await handleCreateSecretStatements(statements);

      const entry = mapping.get('token_creds');
      expect(entry?.authType).toBe('bearer');
    });

    it('should populate mapping regardless of _iDbConn state', async () => {
      mockStoreState = { _iDbConn: null };
      const statements = [
        makeStatement(
          "CREATE SECRET my_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey')",
          SQLStatement.CREATE,
        ),
      ];

      const mapping = await handleCreateSecretStatements(statements);

      // Mapping should be populated for in-batch inference
      expect(mapping.size).toBe(1);
      expect(mapping.has('my_secret')).toBe(true);
      // handleCreateSecretStatements never persists directly
      expect(mockPutSecret).not.toHaveBeenCalled();
    });
  });

  describe('persistSecretMappingEntries', () => {
    it('should persist entries to the encrypted store', async () => {
      const entries = [
        {
          secretName: 'my_secret',
          entry: {
            secretRef: 'ref-1' as SecretId,
            secretType: 's3',
            authType: 'sigv4' as const,
            data: { authType: 'sigv4', awsKeyId: 'AKID', awsSecret: 'skey' },
          },
        },
      ];

      await persistSecretMappingEntries(entries);

      expect(mockPutSecret).toHaveBeenCalledTimes(1);
      expect(mockPutSecret).toHaveBeenCalledWith(
        { fake: true },
        'ref-1',
        expect.objectContaining({
          label: 'SQL Secret: my_secret',
          data: expect.objectContaining({ awsKeyId: 'AKID' }),
        }),
      );
    });

    it('should skip persistence when _iDbConn is null', async () => {
      mockStoreState = { _iDbConn: null };
      const entries = [
        {
          secretName: 'my_secret',
          entry: {
            secretRef: 'ref-1' as SecretId,
            secretType: 's3',
            authType: 'sigv4' as const,
            data: { authType: 'sigv4', awsKeyId: 'AKID' },
          },
        },
      ];

      await persistSecretMappingEntries(entries);

      expect(mockPutSecret).not.toHaveBeenCalled();
    });

    it('should skip entries without data', async () => {
      const entries = [
        {
          secretName: 'my_secret',
          entry: {
            secretRef: 'ref-1' as SecretId,
            secretType: 's3',
            authType: 'sigv4' as const,
          },
        },
      ];

      await persistSecretMappingEntries(entries);

      expect(mockPutSecret).not.toHaveBeenCalled();
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
      const statements = [makeStatement('DETACH remote_db', SQLStatement.DETACH)];
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
      const statements = [makeStatement('DETACH my_catalog', SQLStatement.DETACH)];
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
      const statements = [makeStatement('DETACH local_db', SQLStatement.DETACH)];
      const ctx = makeContext(existing);

      await handleDetachStatements(statements, ctx);

      expect(ctx.updatedDataSources.size).toBe(0);
      expect(mockPersistDelete).toHaveBeenCalledTimes(1);
    });

    it('should ignore non-DETACH statements', async () => {
      const statements = [makeStatement('SELECT 1', SQLStatement.SELECT)];
      const ctx = makeContext();

      await handleDetachStatements(statements, ctx);

      expect(mockPersistDelete).not.toHaveBeenCalled();
    });

    it('should handle DETACH of non-existent database gracefully', async () => {
      const statements = [makeStatement('DETACH nonexistent', SQLStatement.DETACH)];
      const ctx = makeContext();

      await handleDetachStatements(statements, ctx);

      expect(mockPersistDelete).not.toHaveBeenCalled();
    });
  });
});
