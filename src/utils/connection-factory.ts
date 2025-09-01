/**
 * Connection Factory for Remote Databases
 *
 * Provides platform-aware connection handling for different database types.
 * Abstracts the differences between WASM and Tauri capabilities.
 */

import { ConnectionPool, EngineType } from '@engines/types';
import { RemoteDB } from '@models/data-source';

import { buildAttachQuery } from './sql-attach';
import { isMotherDuckUrl } from './url-helpers';
import { ConnectionsAPI } from '../services/connections-api';

/**
 * Interface for creating and managing database connections across platforms
 */
export interface ConnectionFactory {
  /**
   * Check if this factory can handle the given remote database
   */
  canConnect: (db: RemoteDB) => boolean;

  /**
   * Create a connection string/URL for the database
   * This may involve fetching credentials from the backend
   */
  createConnectionString: (db: RemoteDB) => Promise<string>;

  /**
   * Attach the database to the DuckDB connection pool
   */
  attachDatabase: (pool: ConnectionPool, db: RemoteDB) => Promise<void>;

  /**
   * Get a list of limitations or requirements for this connection type
   */
  getConnectionRequirements: (db: RemoteDB) => string[];
}

/**
 * Connection factory for WASM/Browser environment
 * Limited to URL-based connections that work within browser security constraints
 */
export class WASMConnectionFactory implements ConnectionFactory {
  canConnect(db: RemoteDB): boolean {
    return db.supportedPlatforms.includes('duckdb-wasm');
  }

  async createConnectionString(db: RemoteDB): Promise<string> {
    // WASM can only handle direct URLs and specific cloud services
    if (db.connectionType === 'postgres' || db.connectionType === 'mysql') {
      throw new Error(
        `Direct ${db.connectionType} connections are not supported in browser environment. ` +
        'Please use the desktop app or configure a proxy server.'
      );
    }

    if (db.legacyUrl) {
      return db.legacyUrl;
    }

    if (db.connectionId) {
      throw new Error(
        'Connection ID based databases require the desktop app. ' +
        'Please use the desktop version for full database connectivity.'
      );
    }

    throw new Error('No valid connection method available for this database in browser environment');
  }

  async attachDatabase(pool: ConnectionPool, db: RemoteDB): Promise<void> {
    const connectionString = await this.createConnectionString(db);

    let attachQuery = buildAttachQuery(connectionString, db.dbName, { readOnly: true });

    // Special handling for MotherDuck
    if (isMotherDuckUrl(connectionString)) {
      const { quote } = await import('@utils/helpers');
      attachQuery = `ATTACH ${quote(connectionString.trim(), { single: true })}`;
    }

    await pool.query(attachQuery);
  }

  getConnectionRequirements(db: RemoteDB): string[] {
    const requirements: string[] = [];

    if (db.connectionType === 'postgres' || db.connectionType === 'mysql') {
      requirements.push('Requires desktop app for direct database connections');
      requirements.push('Browser security prevents direct TCP connections');
    }

    if (db.connectionType === 's3') {
      requirements.push('Requires proper CORS configuration on S3 bucket');
      requirements.push('May require public read access or presigned URLs');
    }

    if (db.connectionType === 'http') {
      requirements.push('Requires HTTPS for secure connections');
      requirements.push('May require CORS headers from server');
    }

    return requirements;
  }
}

/**
 * Connection factory for Tauri/Desktop environment
 * Full connectivity including direct database connections
 */
export class TauriConnectionFactory implements ConnectionFactory {
  canConnect(db: RemoteDB): boolean {
    return db.supportedPlatforms.includes('duckdb-tauri');
  }

  async createConnectionString(db: RemoteDB): Promise<string> {
    // Prefer connection ID over legacy URL
    if (db.connectionId) {
      try {
        // Fetch the complete connection string with resolved credentials from backend
        return await ConnectionsAPI.getConnectionWithCredentials(db.connectionId);
      } catch (error) {
        console.error('Failed to get connection with credentials:', error);
        throw new Error(`Failed to resolve connection credentials: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (db.legacyUrl) {
      return db.legacyUrl;
    }

    throw new Error('No valid connection method available - missing both connection ID and URL');
  }

  async attachDatabase(pool: ConnectionPool, db: RemoteDB): Promise<void> {
    if (db.connectionId) {
      // Use the new backend API for connection-based attachments
      await ConnectionsAPI.attachRemoteDatabase(db.connectionId, db.dbName);
      return;
    }

    if (db.legacyUrl) {
      // Fall back to direct URL attachment for legacy databases
      const connectionString = await this.createConnectionString(db);
      let attachQuery = buildAttachQuery(connectionString, db.dbName, { readOnly: true });

      // Special handling for MotherDuck
      if (isMotherDuckUrl(connectionString)) {
        const { quote } = await import('@utils/helpers');
        attachQuery = `ATTACH ${quote(connectionString.trim(), { single: true })}`;
      }

      await pool.query(attachQuery);
      return;
    }

    throw new Error('Unable to attach database - no valid connection method');
  }

  getConnectionRequirements(db: RemoteDB): string[] {
    const requirements: string[] = [];

    if (db.connectionType === 'postgres') {
      requirements.push('Requires PostgreSQL server to be accessible from this machine');
      requirements.push('Uses DuckDB\'s postgres_scanner extension');
    }

    if (db.connectionType === 'mysql') {
      requirements.push('Requires MySQL server to be accessible from this machine');
      requirements.push('Uses DuckDB\'s mysql_scanner extension');
    }

    if (db.connectionType === 's3') {
      requirements.push('Requires valid AWS credentials or bucket permissions');
      requirements.push('Uses DuckDB\'s httpfs extension for S3 access');
    }

    return requirements;
  }
}

/**
 * Factory function to create the appropriate connection factory for the current environment
 */
export function createConnectionFactory(engineType: EngineType): ConnectionFactory {
  switch (engineType) {
    case 'duckdb-wasm':
      return new WASMConnectionFactory();
    case 'duckdb-tauri':
      return new TauriConnectionFactory();
    default:
      throw new Error(`Unsupported engine type: ${engineType}`);
  }
}

/**
 * Check if a remote database is supported on the current platform
 */
export function isDatabaseSupportedOnPlatform(db: RemoteDB, engineType: EngineType): boolean {
  return db.supportedPlatforms.includes(engineType);
}

/**
 * Get user-friendly error message for unsupported database types
 */
export function getUnsupportedDatabaseMessage(db: RemoteDB, engineType: EngineType): string {
  if (engineType === 'duckdb-wasm') {
    if (db.connectionType === 'postgres' || db.connectionType === 'mysql') {
      return `${db.connectionType === 'postgres' ? 'PostgreSQL' : 'MySQL'} databases require the desktop app. Browser security prevents direct database connections.`;
    }
  }

  return `This database type (${db.connectionType}) is not supported on ${engineType === 'duckdb-wasm' ? 'web' : 'desktop'} platform.`;
}
