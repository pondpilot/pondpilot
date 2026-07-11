import {
  detachAndUnregisterDatabase,
  registerAndAttachDatabase,
} from '@controllers/db/data-source';
import { getLocalDBs, getViews } from '@controllers/db/duckdb-meta';
import { addLocalFileOrFolders } from '@controllers/file-system/file-system-controller';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { useAppStore } from '@store/app-store';

jest.mock('@controllers/db/data-source');
jest.mock('@controllers/db/duckdb-meta');

const mockDetachAndUnregisterDatabase = detachAndUnregisterDatabase as jest.MockedFunction<
  typeof detachAndUnregisterDatabase
>;
const mockGetLocalDBs = getLocalDBs as jest.MockedFunction<typeof getLocalDBs>;
const mockGetViews = getViews as jest.MockedFunction<typeof getViews>;
const mockRegisterAndAttachDatabase = registerAndAttachDatabase as jest.MockedFunction<
  typeof registerAndAttachDatabase
>;

const makeDuckDBHandle = (name: string): FileSystemFileHandle =>
  ({
    kind: 'file',
    name,
    getFile: jest.fn(async () => new File(['test'], name)),
    isSameEntry: jest.fn(async () => false),
  }) as unknown as FileSystemFileHandle;

const makeEmptyDatabasePool = () =>
  ({
    query: jest.fn(async () => ({
      getChild: () => ({ get: () => 0n }),
    })),
  }) as unknown as AsyncDuckDBConnectionPool;

describe('local DuckDB import cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      _iDbConn: null,
      dataSources: new Map(),
      databaseMetadata: new Map(),
      localEntries: new Map(),
      registeredFiles: new Map(),
    });
    mockGetLocalDBs.mockResolvedValue([]);
    mockGetViews.mockResolvedValue([]);
    mockRegisterAndAttachDatabase.mockResolvedValue(new File(['test'], 'empty.duckdb'));
  });

  it('detaches and unregisters an empty database without adding it to state', async () => {
    const conn = makeEmptyDatabasePool();

    const result = await addLocalFileOrFolders(conn, [makeDuckDBHandle('empty.duckdb')]);

    expect(detachAndUnregisterDatabase).toHaveBeenCalledWith(conn, 'empty', 'empty.duckdb');
    expect(result).toMatchObject({
      skippedEmptyDatabases: ['empty'],
      newEntries: [],
      newDataSources: [],
      errors: [],
    });
    expect(useAppStore.getState().registeredFiles).toHaveProperty('size', 0);
  });

  it('reports an empty-database detach failure and still leaves it out of state', async () => {
    const conn = makeEmptyDatabasePool();
    mockDetachAndUnregisterDatabase.mockRejectedValue('detach failed');

    const result = await addLocalFileOrFolders(conn, [makeDuckDBHandle('empty.duckdb')]);

    expect(result).toMatchObject({
      newEntries: [],
      newDataSources: [],
      errors: ['Failed to import empty: detach failed'],
    });
    expect(useAppStore.getState().dataSources).toHaveProperty('size', 0);
    expect(useAppStore.getState().localEntries).toHaveProperty('size', 0);
    expect(useAppStore.getState().registeredFiles).toHaveProperty('size', 0);
  });
});
