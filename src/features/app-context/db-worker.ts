import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Table } from 'apache-arrow';

// TODO: REMOVE WHEN query handling filly refactored

/**
 * Retrieves the total number of rows for pagination by executing a count query.
 *
 * @param {AsyncDuckDBConnection} conn - The DuckDB connection instance.
 * @param {string} query - The SQL query to count rows from.
 * @returns {Promise<number>} The total number of rows.
 */
export const getPaginationRowsCount = async (
  conn: AsyncDuckDBConnectionPool,
  query: string,
): Promise<number> => {
  const pagination = await conn.query(`SELECT COUNT(*) FROM (${query});`);

  const totalRowsCount = pagination?.toArray().map((row) => {
    const count = Object.values(row.toJSON())[0];
    if (typeof count === 'bigint') {
      return Number(count.toString());
    }
    if (typeof count === 'number') {
      return count;
    }
    return 0;
  }) || [0];

  return totalRowsCount[0] as number;
};

export interface DBRunQueryProps {
  query: string;
  limit?: number;
  offset?: number;
  hasLimit?: boolean;
  isPagination?: boolean;
  queryWithoutLimit?: string;
}
export interface RunQueryResponse {
  data: Table;
  pagination: number;
}

/**
 * Run paginated query
 */
export async function runQueryDeprecated({
  query,
  hasLimit,
  queryWithoutLimit,
  conn,
}: DBRunQueryProps & { conn: AsyncDuckDBConnectionPool }): Promise<
  Omit<RunQueryResponse, 'originalQuery'>
> {
  try {
    /**
     * Run query
     */
    const result = await conn.query(query);

    /**
     * Get total rows count for pagination
     */
    const totalRowsCount = hasLimit
      ? await getPaginationRowsCount(conn, queryWithoutLimit || query)
      : 0;

    /**
     * Return data and pagination
     */
    return {
      data: result,
      pagination: totalRowsCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(message);
  }
}
