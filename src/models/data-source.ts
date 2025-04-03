export type DataSourceId = string & { readonly _: unique symbol };

export interface DataSource {
  dataSourceId: DataSourceId;
}

export type DataSourceIconType = 'sql-script' | 'csv' | 'json' | 'table' | 'x';
