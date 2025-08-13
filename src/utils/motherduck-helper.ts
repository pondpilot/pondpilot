import { ConnectionPool } from '@engines/types';
import { RemoteDB } from '@models/data-source';
import { makePersistentDataSourceId } from '@utils/data-source';
import { quote } from '@utils/helpers';
import { isMotherDuckUrl } from '@utils/url-helpers';

/**
 * Common MotherDuck attachment logic
 * @param pool Connection pool to use
 * @param dbNameOrUrl Database name (will be prefixed with 'md:') or full MotherDuck URL
 * @returns Object with attached database name and the RemoteDB object
 */
export async function attachMotherDuckDatabase(
  pool: ConnectionPool,
  dbNameOrUrl: string,
): Promise<{ dbName: string; remoteDb: RemoteDB }> {
  // Determine if we have a full URL or just a database name
  const isFullUrl = isMotherDuckUrl(dbNameOrUrl);
  const url = isFullUrl ? dbNameOrUrl.trim() : `md:${dbNameOrUrl}`;
  const dbName = isFullUrl ? dbNameOrUrl.trim().slice(3) : dbNameOrUrl;

  // Try to load the MotherDuck extension first
  try {
    const { ExtensionLoader } = await import('../services/extension-loader');
    await ExtensionLoader.installAndLoadExtension(pool, 'motherduck', true);
  } catch (e) {
    // Proceed anyway - ATTACH will surface any remaining errors
    console.warn('Failed to pre-load motherduck extension:', e);
  }

  // Create the RemoteDB object
  const remoteDb: RemoteDB = {
    type: 'remote-db',
    id: makePersistentDataSourceId(),
    url,
    dbName,
    dbType: 'duckdb' as const,
    connectionState: 'connecting',
    attachedAt: Date.now(),
    // For MotherDuck databases attached via direct URL, we don't have the secret name
    // so we use 'default' to group them together
    instanceName: 'default',
  };

  // For MotherDuck, we need to use the special syntax without an alias
  const attachQuery = `ATTACH ${quote(url, { single: true })}`;

  return { dbName, remoteDb };
}

/**
 * Verify that a database is attached and visible in the catalog
 * @param pool Connection pool to use
 * @param dbName Database name to check
 * @param maxAttempts Maximum number of attempts (default 3)
 * @param delayMs Delay between attempts in milliseconds (default 250)
 */
export async function verifyDatabaseAttached(
  pool: ConnectionPool,
  dbName: string,
  maxAttempts = 3,
  delayMs = 250,
): Promise<boolean> {
  const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = ${quote(dbName, { single: true })}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await pool.query(checkQuery);
      if (result && result.numRows > 0) {
        return true;
      }
    } catch (error) {
      console.warn(`Attempt ${attempt + 1}: Database not ready yet, waiting...`);
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Database ${dbName} could not be verified after ${maxAttempts} attempts`);
}

// Constants for configuration
export const MOTHERDUCK_CONSTANTS = {
  CATALOG_VERIFICATION_DELAY_MS: 250,
  MAX_VERIFICATION_ATTEMPTS: 3,
  DEFAULT_ATTACH_TIMEOUT_MS: 30000,
  DEFAULT_ATTACH_MAX_RETRIES: 3,
  DEFAULT_RETRY_DELAY_MS: 2000,
} as const;
