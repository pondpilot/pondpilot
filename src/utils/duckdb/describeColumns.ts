import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { getColumnType } from './getColumnType';

type DescribeColumnsProps = {
  table: string;
  conn: AsyncDuckDBConnection;
};
/**
 * Describe the columns of a table.
 */
export async function describeColumns(props: DescribeColumnsProps) {
  const { table, conn } = props;
  const res = await conn.query(`DESCRIBE '${table}'`);
  const columns = res.toArray();

  return columns.map(({ column_name, column_type }) => ({
    name: column_name,
    type: getColumnType(column_type),
    databaseType: column_type,
  }));
}
