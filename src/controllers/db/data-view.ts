import { DataAdapterApi, DataViewCacheKey } from '@models/data-adapter';
import { AnyFlatFileDataSource } from '@models/data-source';
import { LocalEntry } from '@models/file-system';
import { TabId } from '@models/tab';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

function getFlatFileGetReaderApi(dataView: AnyFlatFileDataSource): DataAdapterApi['getReader'] {
  return async (db, sort) => {
    let baseQuery = `SELECT * FROM main.${toDuckDBIdentifier(dataView.viewName)}`;

    if (sort.length > 0) {
      const orderBy = sort.map((s) => `${s.column} ${s.order || 'asc'}`).join(', ');
      baseQuery += ` ORDER BY ${orderBy}`;
    }
    const reader = await db.send(baseQuery);
    return reader;
  };
}

export function getFlatFileDataAdapterApi(
  dataSource: AnyFlatFileDataSource,
  tabId: TabId,
  sourceFile: LocalEntry,
): DataAdapterApi {
  if (dataSource.type === 'csv') {
    return {
      getCacheKey: () => tabId as unknown as DataViewCacheKey,
      getRowCount: undefined,
      // TODO: implement this
      getEstimatedRowCount: undefined,
      getReader: getFlatFileGetReaderApi(dataSource),
    };
  }

  if (dataSource.type === 'parquet') {
    return {
      getCacheKey: () => tabId as unknown as DataViewCacheKey,
      getRowCount: async (db) => {
        const result = await db.query(
          `SELECT num_rows FROM parquet_file_metadata('${sourceFile.uniqueAlias}')`,
        );

        const count = Number(result.getChildAt(0)?.get(0));
        return count;
      },
      getReader: getFlatFileGetReaderApi(dataSource),
    };
  }

  throw new Error('TODO');
}
