import { DataViewAdapterApi, DataViewData, AnyPersistentDataView } from '@models/data-view';

function getGetReaderApi(dataView: AnyPersistentDataView): DataViewAdapterApi['getReader'] {
  return async (db, sort) => {
    let baseQuery = `SELECT * FROM ${dataView.fullyQualifiedName}`;

    if (sort.length > 0) {
      const orderBy = sort
        .map((s) => {
          const column = s[0];
          const order = s[1] || 'asc';
          return `${column} ${order}`;
        })
        .join(', ');
      baseQuery += ` ORDER BY ${orderBy}`;
    }
    const reader = await db.send(baseQuery);
    return reader;
  };
}

export function getDataViewAdapter(dataView: DataViewData): DataViewAdapterApi {
  if (dataView.type === 'persistent') {
    const persistentDataView = dataView as AnyPersistentDataView;
    if (persistentDataView.sourceType === 'csv') {
      return {
        getRowCount: undefined,
        // TODO: implement this
        getEstimatedRowCount: undefined,
        getReader: getGetReaderApi(persistentDataView),
      };
    }

    if (dataView.sourceType === 'parquet') {
      return {
        getRowCount: async (db) => {
          const result = await db.query(
            `SELECT num_rows FROM parquet_file_metadata('${persistentDataView.registeredFileName}')`,
          );
          const count = Number(result.getChildAt(0)?.get(0));
          return count;
        },
        getReader: getGetReaderApi(persistentDataView),
      };
    }

    throw new Error('TODO');
  }

  throw new Error('TODO');
}
