import { deleteDataSources } from '@controllers/data-source/data-view-source';
import { detachAndUnregisterDatabase } from '@controllers/db';
import { describe, expect, it, jest } from '@jest/globals';
import { LocalDB, PersistentDataSourceId } from '@models/data-source';
import { DataSourceLocalFile, LocalEntryId } from '@models/file-system';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { useAppStore } from '@store/app-store';

jest.mock('@controllers/db');

const mockDetachAndUnregisterDatabase = detachAndUnregisterDatabase as jest.MockedFunction<
  typeof detachAndUnregisterDatabase
>;

describe('data source deletion cleanup', () => {
  it('preserves application registration when database detach fails', async () => {
    const dataSourceId = 'warehouse-source' as PersistentDataSourceId;
    const fileId = 'warehouse-file' as LocalEntryId;
    const fileHandle = {} as FileSystemFileHandle;
    const fileEntry: DataSourceLocalFile = {
      id: fileId,
      kind: 'file',
      fileType: 'data-source',
      ext: 'duckdb',
      name: 'warehouse',
      uniqueAlias: 'warehouse',
      parentId: null,
      userAdded: true,
      handle: fileHandle,
    };
    const dataSource: LocalDB = {
      id: dataSourceId,
      type: 'attached-db',
      dbType: 'duckdb',
      dbName: 'warehouse',
      fileSourceId: fileId,
    };
    const registeredFile = new File(['test'], 'warehouse.duckdb');
    useAppStore.setState({
      _iDbConn: null,
      activeTabId: null,
      previewTabId: null,
      tabOrder: [],
      tabs: new Map(),
      dataSources: new Map([[dataSourceId, dataSource]]),
      dataSourceAccessTimes: new Map(),
      tableAccessTimes: new Map(),
      databaseMetadata: new Map(),
      localEntries: new Map([[fileId, fileEntry]]),
      registeredFiles: new Map([[fileId, registeredFile]]),
    });
    mockDetachAndUnregisterDatabase.mockRejectedValue(new Error('database is busy'));
    const conn = {} as AsyncDuckDBConnectionPool;

    await expect(deleteDataSources(conn, [dataSourceId])).rejects.toThrow('database is busy');

    expect(detachAndUnregisterDatabase).toHaveBeenCalledWith(conn, 'warehouse', 'warehouse.duckdb');
    expect(useAppStore.getState().dataSources.get(dataSourceId)).toBe(dataSource);
    expect(useAppStore.getState().localEntries.get(fileId)).toBe(fileEntry);
    expect(useAppStore.getState().registeredFiles.get(fileId)).toBe(registeredFile);
  });
});
