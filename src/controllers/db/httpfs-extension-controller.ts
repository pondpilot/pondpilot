import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

const HTTPFS_BOOTSTRAP_STEPS: { statement: string; description: string }[] = [
  {
    statement: 'SET autoinstall_known_extensions = true',
    description: 'allow DuckDB to autoload bundled extensions like httpfs',
  },
  {
    statement: 'INSTALL httpfs',
    description: 'make the httpfs extension available if it is not bundled',
  },
  {
    statement: 'LOAD httpfs',
    description: 'load the httpfs extension so S3/HTTP secrets become available',
  },
  {
    statement: 'INSTALL iceberg',
    description: 'make the iceberg extension available if it is not bundled',
  },
  {
    statement: 'LOAD iceberg',
    description: 'load the iceberg extension so Iceberg REST catalogs become available',
  },
];

/**
 * Configures DuckDB so browser sessions can create HTTP/S3 secrets.
 *
 * The default DuckDB-WASM build ships with a custom HTTP stack that blocks
 * `CREATE SECRET`. These settings restore the standard httpfs extension path
 * and let DuckDB autoload it when needed.
 */
export async function configureConnectionForHttpfs(conn: AsyncDuckDBConnection): Promise<void> {
  for (const { statement, description } of HTTPFS_BOOTSTRAP_STEPS) {
    try {
      await conn.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/^LOAD /i.test(statement) && /already loaded/i.test(message)) {
        continue;
      }
      if (/^INSTALL /i.test(statement) && /already installed/i.test(message)) {
        continue;
      }
      console.warn(`Failed to ${description}:`, message);
      if (statement === 'LOAD httpfs') {
        throw error instanceof Error ? error : new Error(message);
      }
      // Iceberg load failure is non-fatal — the extension may not be available
      if (statement === 'LOAD iceberg') {
        console.warn('Iceberg extension not available, skipping.');
        return;
      }
    }
  }
}
