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

export interface ExtensionBootstrapOptions {
  /**
   * Enable gsheets bootstrap from the community extension repository.
   *
   * NOTE: This requires a compatible gsheets WASM extension build for the
   * current DuckDB-WASM version.
   */
  enableGsheetsCommunity?: boolean;
  /**
   * Optional fully-qualified URL for a gsheets WASM extension binary.
   *
   * When provided, this takes precedence over community INSTALL/LOAD.
   */
  gsheetsExtensionUrl?: string;
  /**
   * Throw when an explicit gsheets binary cannot load. Used while booting the
   * threaded COI bundle so the caller can retry with the EH runtime that the
   * checked-in extension targets.
   */
  failOnGsheetsLoadError?: boolean;
}

let attemptedGsheetsInstallByInstance = new WeakSet<object>();
let warnedMissingBindings = false;

/**
 * Test-only hook to clear module-level gsheets bootstrap state.
 */
export function __resetGsheetsBootstrapForTests(): void {
  attemptedGsheetsInstallByInstance = new WeakSet();
  warnedMissingBindings = false;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Configures DuckDB so browser sessions can create HTTP/S3 secrets.
 *
 * The default DuckDB-WASM build ships with a custom HTTP stack that blocks
 * `CREATE SECRET`. These settings restore the standard httpfs extension path
 * and let DuckDB autoload it when needed.
 *
 * `autoinstall_known_extensions = true` is safe in DuckDB-WASM: extensions
 * are resolved from the bundled set shipped with the WASM build — no
 * untrusted network downloads occur.
 */
export async function configureConnectionForHttpfs(
  conn: AsyncDuckDBConnection,
  options: ExtensionBootstrapOptions = {},
): Promise<void> {
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
        continue;
      }
    }
  }

  const {
    enableGsheetsCommunity = false,
    failOnGsheetsLoadError = false,
    gsheetsExtensionUrl = '',
  } = options;

  // bindings is shared across connections from the same DuckDB-WASM instance.
  // We use it as the WeakSet key so INSTALL runs once per DB, but LOAD runs per connection.
  // When bindings is unavailable, INSTALL deduplication is per-connection (harmless: the
  // "already installed" error is handled below).
  const bindings = conn.bindings as unknown;
  const hasValidBindings =
    bindings != null && (typeof bindings === 'object' || typeof bindings === 'function');
  if (!hasValidBindings && !warnedMissingBindings) {
    warnedMissingBindings = true;
    console.warn(
      'DuckDB connection bindings not available; gsheets INSTALL dedup will run per-connection.',
    );
  }
  const dbInstance = hasValidBindings ? (bindings as object) : conn;

  if (gsheetsExtensionUrl) {
    const escapedUrl = escapeSqlLiteral(gsheetsExtensionUrl);
    let configuredUrlLoaded = false;
    try {
      await conn.query(`LOAD '${escapedUrl}'`);
      configuredUrlLoaded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already loaded/i.test(message)) {
        console.warn(
          `Failed to load gsheets extension from configured URL. ${
            enableGsheetsCommunity
              ? 'Falling back to the community repository.'
              : 'Google Sheets connections will be unavailable.'
          }`,
          message,
        );
        if (failOnGsheetsLoadError && !enableGsheetsCommunity) {
          throw error instanceof Error ? error : new Error(message);
        }
      } else {
        configuredUrlLoaded = true;
      }
    }
    if (configuredUrlLoaded || !enableGsheetsCommunity) {
      return;
    }
  }

  if (!enableGsheetsCommunity) {
    return;
  }

  // INSTALL is database-level and can be skipped once successful for this DB
  // instance, but LOAD must still happen on each connection.
  if (!attemptedGsheetsInstallByInstance.has(dbInstance)) {
    try {
      await conn.query('INSTALL gsheets FROM community');
      attemptedGsheetsInstallByInstance.add(dbInstance);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already installed/i.test(message)) {
        attemptedGsheetsInstallByInstance.add(dbInstance);
      } else {
        console.warn('Failed to install gsheets extension from community repository:', message);
        return;
      }
    }
  }

  try {
    await conn.query('LOAD gsheets');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already loaded/i.test(message)) {
      console.warn(
        'Failed to load gsheets extension from community repository. ' +
          'Set VITE_GSHEETS_EXTENSION_URL to a compatible WASM build. ' +
          'Google Sheets connections will be unavailable.',
        message,
      );
    }
  }
}
