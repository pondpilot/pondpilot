import { v4 as uuidv4 } from 'uuid';
import { findUniqueName } from '@utils/helpers';
import { AnyPersistentDataView, PersistentDataViewId } from '@models/data-view';
import { DataSourceLocalFile } from '@models/file-system';

import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

export function addPersistentDataView(localEntry: DataSourceLocalFile): AnyPersistentDataView {
  const dataViewId = uuidv4() as PersistentDataViewId;

  // TODO: fetch all views currently in memory db from state to avoid duplicates
  // Although we ensure that local entry aliases are unique, nothing stops the user
  // to issue DDL that will use the same name.
  const reservedViews = new Set([] as string[]);
  const viewName = findUniqueName(
    toDuckDBIdentifier(localEntry.uniqueAlias),
    (name: string) => reservedViews.has(name),
    true,
  );

  switch (localEntry.ext) {
    case 'csv':
      return {
        id: dataViewId,
        type: 'persistent',
        sourceType: localEntry.ext,
        fileSourceId: localEntry.id,
        displayName: viewName,
        queryableName: viewName,
        fullyQualifiedName: `main.${viewName}`,
      };
    case 'parquet':
      return {
        id: dataViewId,
        type: 'persistent',
        sourceType: localEntry.ext,
        fileSourceId: localEntry.id,
        displayName: viewName,
        queryableName: viewName,
        fullyQualifiedName: `main.${viewName}`,
        registeredFileName: localEntry.uniqueAlias,
      };
    default:
      throw new Error('TODO: Supported data source file type');
  }
}
