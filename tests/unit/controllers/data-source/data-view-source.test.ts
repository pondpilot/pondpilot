import { deleteDataSources } from '@controllers/data-source/data-view-source';
import {
  detachAndUnregisterDatabase,
  dropViewAndUnregisterFile,
  getDatabaseModel,
} from '@controllers/db';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LocalDB, PersistentDataSourceId, XlsxSheetView } from '@models/data-source';
import { DataSourceLocalFile, LocalEntryId } from '@models/file-system';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { useAppStore } from '@store/app-store';

jest.mock('@controllers/db');

const mockDetachAndUnregisterDatabase = detachAndUnregisterDatabase as jest.MockedFunction<
  typeof detachAndUnregisterDatabase
>;
const mockDropViewAndUnregisterFile = dropViewAndUnregisterFile as jest.MockedFunction<
  typeof dropViewAndUnregisterFile
>;
const mockGetDatabaseModel = getDatabaseModel as jest.MockedFunction<typeof getDatabaseModel>;

describe('data source deletion cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabaseModel.mockResolvedValue(new Map());
  });

  it('optimistically removes and then restores application registration when detach fails', async () => {
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
    let rejectDetach!: (error: Error) => void;
    mockDetachAndUnregisterDatabase.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectDetach = reject;
        }),
    );
    const conn = {} as AsyncDuckDBConnectionPool;

    const deletion = deleteDataSources(conn, [dataSourceId]);

    expect(useAppStore.getState().dataSources.has(dataSourceId)).toBe(false);
    expect(useAppStore.getState().localEntries.has(fileId)).toBe(false);
    expect(useAppStore.getState().registeredFiles.has(fileId)).toBe(false);

    rejectDetach(new Error('database is busy'));
    await expect(deletion).rejects.toThrow('database is busy');

    expect(detachAndUnregisterDatabase).toHaveBeenCalledWith(conn, 'warehouse', 'warehouse.duckdb');
    expect(useAppStore.getState().dataSources.get(dataSourceId)).toBe(dataSource);
    expect(useAppStore.getState().localEntries.get(fileId)).toBe(fileEntry);
    expect(useAppStore.getState().registeredFiles.get(fileId)).toBe(registeredFile);
  });

  it('unregisters a workbook once after dropping all of its sheet views', async () => {
    const fileId = 'workbook-file' as LocalEntryId;
    const employeesId = 'employees-source' as PersistentDataSourceId;
    const productsId = 'products-source' as PersistentDataSourceId;
    const fileEntry: DataSourceLocalFile = {
      id: fileId,
      kind: 'file',
      fileType: 'data-source',
      ext: 'xlsx',
      name: 'workbook',
      uniqueAlias: 'workbook',
      parentId: null,
      userAdded: true,
      handle: {} as FileSystemFileHandle,
    };
    const employees: XlsxSheetView = {
      id: employeesId,
      type: 'xlsx-sheet',
      fileSourceId: fileId,
      sheetName: 'Employees',
      viewName: 'workbook_Employees',
    };
    const products: XlsxSheetView = {
      id: productsId,
      type: 'xlsx-sheet',
      fileSourceId: fileId,
      sheetName: 'Products',
      viewName: 'workbook_Products',
    };
    useAppStore.setState({
      _iDbConn: null,
      activeTabId: null,
      previewTabId: null,
      tabOrder: [],
      tabs: new Map(),
      dataSources: new Map([
        [employeesId, employees],
        [productsId, products],
      ]),
      dataSourceAccessTimes: new Map(),
      tableAccessTimes: new Map(),
      databaseMetadata: new Map(),
      localEntries: new Map([[fileId, fileEntry]]),
      registeredFiles: new Map([[fileId, new File(['test'], 'workbook.xlsx')]]),
    });
    const conn = {} as AsyncDuckDBConnectionPool;

    await deleteDataSources(conn, [employeesId, productsId]);

    expect(mockDropViewAndUnregisterFile).toHaveBeenNthCalledWith(
      1,
      conn,
      'workbook_Employees',
      'workbook.xlsx',
    );
    expect(mockDropViewAndUnregisterFile).toHaveBeenNthCalledWith(
      2,
      conn,
      'workbook_Products',
      undefined,
    );
  });
});
