import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';

let currentConnectionPool: AsyncDuckDBConnectionPool | null = null;

export const getCurrentDuckDBConnectionPool = (): AsyncDuckDBConnectionPool | null =>
  currentConnectionPool;

export const setCurrentDuckDBConnectionPool = (pool: AsyncDuckDBConnectionPool | null): void => {
  currentConnectionPool = pool;
};
