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
   * Optional Google Sheets API access token.
   *
   * When provided, PondPilot will create (or replace):
   * - an HTTP bearer secret for macro-based reads
   * - and, if gsheets extension loads, a `gsheet` access_token secret
   */
  gsheetsAccessToken?: string;
  /**
   * Optional DuckDB secret name used for the gsheets access token secret.
   * Defaults to `pondpilot_gsheet`.
   */
  gsheetsSecretName?: string;
  /**
   * Optional DuckDB secret name used for the HTTP bearer secret that powers
   * macro-based authorized reads (`read_gsheet_authorized(...)`).
   * Defaults to `pondpilot_gsheet_http`.
   */
  gsheetsHttpSecretName?: string;
}

const DEFAULT_GSHEETS_SECRET_NAME = 'pondpilot_gsheet';
const DEFAULT_GSHEETS_HTTP_SECRET_NAME = 'pondpilot_gsheet_http';
const GSHEETS_HTTP_SECRET_SCOPES = [
  'https://docs.google.com/spreadsheets/',
  'https://sheets.googleapis.com/',
];
let attemptedGsheetsBootstrapByInstance: WeakSet<object> = new WeakSet();

/**
 * Test-only hook to clear module-level gsheets bootstrap state.
 */
export function __resetGsheetsBootstrapForTests(): void {
  attemptedGsheetsBootstrapByInstance = new WeakSet();
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function configureGsheetsAccessTokenSecret(
  conn: AsyncDuckDBConnection,
  token: string,
  secretName: string,
): Promise<void> {
  const normalizedSecretName = secretName.trim() || DEFAULT_GSHEETS_SECRET_NAME;
  const escapedToken = escapeSqlLiteral(token);
  const quotedSecretName = quoteSqlIdentifier(normalizedSecretName);

  try {
    await conn.query(
      `CREATE OR REPLACE SECRET ${quotedSecretName} (TYPE gsheet, PROVIDER access_token, TOKEN '${escapedToken}')`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Failed to create gsheets access_token secret "${normalizedSecretName}". ` +
        'Authorized read_gsheet(...) queries may fail.',
      message,
    );
  }
}

async function configureGsheetsHttpBearerSecret(
  conn: AsyncDuckDBConnection,
  token: string,
  secretName: string,
): Promise<void> {
  const normalizedSecretName = secretName.trim() || DEFAULT_GSHEETS_HTTP_SECRET_NAME;
  const escapedToken = escapeSqlLiteral(token);
  const quotedSecretName = quoteSqlIdentifier(normalizedSecretName);
  const scopeList = GSHEETS_HTTP_SECRET_SCOPES.map((scope) => `'${escapeSqlLiteral(scope)}'`).join(
    ', ',
  );

  try {
    await conn.query(
      `CREATE OR REPLACE SECRET ${quotedSecretName} (TYPE HTTP, PROVIDER CONFIG, BEARER_TOKEN '${escapedToken}', SCOPE (${scopeList}))`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Failed to create gsheets HTTP bearer secret "${normalizedSecretName}". ` +
        'read_gsheet_authorized(...) may fail.',
      message,
    );
  }
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
        return;
      }
    }
  }

  const {
    enableGsheetsCommunity = false,
    gsheetsExtensionUrl = '',
    gsheetsAccessToken = '',
    gsheetsSecretName = DEFAULT_GSHEETS_SECRET_NAME,
    gsheetsHttpSecretName = DEFAULT_GSHEETS_HTTP_SECRET_NAME,
  } = options;
  const hasGsheetsAccessToken = gsheetsAccessToken.trim().length > 0;

  if (hasGsheetsAccessToken) {
    await configureGsheetsHttpBearerSecret(conn, gsheetsAccessToken, gsheetsHttpSecretName);
  }

  const bindings = conn.bindings as unknown;
  const dbInstance =
    bindings && (typeof bindings === 'object' || typeof bindings === 'function') ? bindings : conn;

  // The connection pool may initialize multiple DB connections for one DuckDB
  // instance; avoid repeating gsheets bootstrap for that same instance.
  if (attemptedGsheetsBootstrapByInstance.has(dbInstance)) {
    return;
  }

  if (gsheetsExtensionUrl) {
    attemptedGsheetsBootstrapByInstance.add(dbInstance);
    const escapedUrl = escapeSqlLiteral(gsheetsExtensionUrl);
    let gsheetsLoaded = false;
    try {
      await conn.query(`LOAD '${escapedUrl}'`);
      gsheetsLoaded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already loaded/i.test(message)) {
        gsheetsLoaded = true;
      } else {
        console.warn(
          'Failed to load gsheets extension from configured URL. ' +
            'Using macro-based Google Sheets reads only.',
          message,
        );
      }
    }

    if (gsheetsLoaded && hasGsheetsAccessToken) {
      await configureGsheetsAccessTokenSecret(conn, gsheetsAccessToken, gsheetsSecretName);
    }
    return;
  }

  if (!enableGsheetsCommunity) {
    return;
  }

  attemptedGsheetsBootstrapByInstance.add(dbInstance);
  try {
    await conn.query('INSTALL gsheets FROM community');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already installed/i.test(message)) {
      console.warn('Failed to install gsheets extension from community repository:', message);
      return;
    }
  }

  try {
    await conn.query('LOAD gsheets');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already loaded/i.test(message)) {
      if (hasGsheetsAccessToken) {
        await configureGsheetsAccessTokenSecret(conn, gsheetsAccessToken, gsheetsSecretName);
      }
      return;
    }

    console.warn(
      'Failed to load gsheets extension from community repository. ' +
        'If community WASM is unavailable, set VITE_GSHEETS_EXTENSION_URL to a local/self-hosted wasm build. ' +
        'Using macro-based Google Sheets reads only.',
      message,
    );
    return;
  }

  if (hasGsheetsAccessToken) {
    await configureGsheetsAccessTokenSecret(conn, gsheetsAccessToken, gsheetsSecretName);
  }
}
