import { AnyDataSource, DataSourcePersistece } from '@models/data-source';

export function getSerializedDataSource(ds: AnyDataSource): DataSourcePersistece {
  const {
    getQueryableName: _1,
    getFullyQualifiedName: _2,
    getRowCount: _3,
    getReader: _4,
    ...serializable
  } = ds;
  return serializable;
}
