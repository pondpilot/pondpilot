import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';

export async function fetchDatabaseSchema(
  duckDbConnectionPool: AsyncDuckDBConnectionPool,
): Promise<string> {
  try {
    const result = await duckDbConnectionPool.query(`
      SELECT table_schema, table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name, ordinal_position
    `);
    const schemaInfo = result.toArray();

    // Format schema context
    const tables = new Map<string, string[]>();
    schemaInfo.forEach((row: any) => {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!tables.has(key)) {
        tables.set(key, []);
      }
      tables.get(key)!.push(`${row.column_name} (${row.data_type})`);
    });

    return Array.from(tables.entries())
      .map(([table, columns]) => `${table}:\n  ${columns.join('\n  ')}`)
      .join('\n\n');
  } catch (error) {
    console.warn('Failed to get schema context:', error);
    return '';
  }
}
