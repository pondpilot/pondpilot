import { PERSISTENT_DB_NAME } from './db-persistence';
import { LocalEntryId } from './file-system';
import { NewId } from './new-id';
import { EngineType } from '../engines/types';

// We have two types of data view sources:
// 1. Persistent - these are stored in app state to allow
//    reloading the app and restoring the state. Locally added
//    non-databse files produce persistent data views.
//    In some cases we have non-flat sources, like databases and
//    may later have partioned parquet files, multi-file csv views etc.
// 2. Transient - these are not stored as a separate object in app state and
//    are created on the fly by the Tab. As of today this is only
//    scripts, that needs to store last executed query, which is stored
//    in the tab state directly.

export type PersistentDataSourceId = NewId<'PersistentDataSourceId'>;

/**
 * Types of remote database connections
 */
export type RemoteConnectionType =
  | 'url' // Legacy direct URL connections
  | 'postgres' // PostgreSQL via connection system
  | 'mysql' // MySQL via connection system
  | 'motherduck' // MotherDuck cloud service
  | 's3' // S3/cloud storage
  | 'http'; // HTTP/HTTPS endpoints

/**
 * Every single file data source must have a unique id & and a reference to
 * the file providing the data.
 */
interface SingleFileDataSourceBase {
  id: PersistentDataSourceId;

  /**
   * Unique identifier for the file providing the data. One file can provide
   * multiple data views (e.g. multiple sheets in a spreadsheet).
   */
  fileSourceId: LocalEntryId;
}

/**
 * Flat file data source is a data source that is a 1-1 mapping
 * from a single file to a single data view.
 * It is a flat file, like CSV or Parquet.
 *
 * Note, that a folder of CSVs, or Parquets etc. can also be read
 * as a single partitioned data source. These are not supported
 * yet, but will be a different type of data source.
 */
interface FlatFileDataSource extends SingleFileDataSourceBase {
  /**
   * Unqualified unquoted view name.
   *
   * Remember to use `toDuckDBIdentifier` to escape the name in query.
   */
  viewName: string;
}

export interface CSVView extends FlatFileDataSource {
  readonly type: 'csv';
}

export interface JSONView extends FlatFileDataSource {
  readonly type: 'json';
}

export interface ParquetView extends FlatFileDataSource {
  readonly type: 'parquet';
}

/**
 * Xlsx themselves are non-flat file data source as it may contain
 * multiple sheets. But we create a persistent data source for each
 * sheet for user convenience, creating managed views and reconciling
 * sheet vs. views changes on init/external file change.
 */
export interface XlsxSheetView extends FlatFileDataSource {
  readonly type: 'xlsx-sheet';

  /**
   * Name of the sheet in the spreadsheet.
   */
  sheetName: string;
}

// Statistical file formats (Tauri-only)
export interface SAS7BDATView extends FlatFileDataSource {
  readonly type: 'sas7bdat';
}

export interface XPTView extends FlatFileDataSource {
  readonly type: 'xpt';
}

export interface SAVView extends FlatFileDataSource {
  readonly type: 'sav';
}

export interface ZSAVView extends FlatFileDataSource {
  readonly type: 'zsav';
}

export interface PORView extends FlatFileDataSource {
  readonly type: 'por';
}

export interface DTAView extends FlatFileDataSource {
  readonly type: 'dta';
}

export type AnyFlatFileDataSource =
  | CSVView
  | ParquetView
  | XlsxSheetView
  | JSONView
  | SAS7BDATView
  | XPTView
  | SAVView
  | ZSAVView
  | PORView
  | DTAView;

export interface LocalDB extends SingleFileDataSourceBase {
  readonly type: 'attached-db';

  /**
   * Type of the database.
   */
  dbType: 'duckdb' | 'sqlite';

  /**
   * valid unique identifier used to attach db as
   */
  dbName: string;
}

/**
 * Remote database attached via URL or connection system
 * These databases are accessed over the network through various protocols
 */
export interface RemoteDB {
  readonly type: 'remote-db';

  /**
   * Unique identifier for the remote database
   */
  id: PersistentDataSourceId;

  /**
   * Type of remote connection (determines how to connect)
   */
  connectionType: RemoteConnectionType;

  /**
   * Legacy URL for direct connections (deprecated, use connectionId for new connections)
   * Only used for backward compatibility with existing url-based connections
   */
  legacyUrl?: string;

  /**
   * Connection ID for new-style database connections using the connections system
   * When present, this takes precedence over legacyUrl for reconnection
   */
  connectionId?: string;

  /**
   * Database name used in ATTACH statement
   */
  dbName: string;

  /**
   * Original database name before aliasing (for conflict resolution)
   * Only set if the database had to be aliased due to naming conflicts
   */
  originalDbName?: string;

  /**
   * Query engine type (DuckDB acts as client for all remote databases)
   */
  queryEngineType: 'duckdb';

  /**
   * Platforms that support this connection type
   */
  supportedPlatforms: EngineType[];

  /**
   * Whether this connection requires a proxy to work in WASM
   */
  requiresProxy?: boolean;

  /**
   * Connection state for handling network issues
   */
  connectionState: 'connected' | 'disconnected' | 'error' | 'connecting';

  /**
   * Error message if connection failed
   */
  connectionError?: string;

  /**
   * Timestamp of when this database was attached
   */
  attachedAt: number;

  /**
   * Optional comment/description
   */
  comment?: string;

  /**
   * Instance name for grouping (e.g., credential name for MotherDuck)
   * Used to distinguish between different instances of the same service
   * This is the display name and may change when the secret is renamed
   */
  instanceName?: string;

  /**
   * Stable instance identifier (e.g., secret UUID for MotherDuck databases)
   * Used for grouping and persistence, won't change even if secret is renamed
   */
  instanceId?: string;
}

export type AnyDataSource = AnyFlatFileDataSource | LocalDB | RemoteDB;

/**
 * Determines which platforms support a given connection type
 */
export function getSupportedPlatforms(connectionType: RemoteConnectionType): EngineType[] {
  switch (connectionType) {
    case 'url':
    case 'motherduck':
    case 's3':
    case 'http':
      return ['duckdb-wasm', 'duckdb-tauri'];
    case 'postgres':
    case 'mysql':
      return ['duckdb-tauri']; // Browser cannot directly connect to databases
    default:
      return ['duckdb-tauri'];
  }
}

/**
 * Determines if a connection requires proxy support in WASM
 */
export function requiresProxy(connectionType: RemoteConnectionType): boolean {
  switch (connectionType) {
    case 'postgres':
    case 'mysql':
      return true; // Would need proxy to work in browser
    default:
      return false;
  }
}

/**
 * Migrates legacy RemoteDB with url field to new format
 */
export function migrateRemoteDB(legacyDb: any): RemoteDB {
  // Safety check - if it's already a properly structured RemoteDB with all required fields
  if (legacyDb && legacyDb.connectionType && legacyDb.supportedPlatforms && (legacyDb.legacyUrl || legacyDb.connectionId)) {
    return legacyDb as RemoteDB;
  }

  // If it has connectionType but missing supportedPlatforms, add them
  if (legacyDb && legacyDb.connectionType && !legacyDb.supportedPlatforms) {
    return {
      ...legacyDb,
      supportedPlatforms: getSupportedPlatforms(legacyDb.connectionType),
      requiresProxy: requiresProxy(legacyDb.connectionType),
      queryEngineType: legacyDb.queryEngineType || 'duckdb',
    };
  }

  // Handle backward compatibility for existing RemoteDB objects
  if (legacyDb && legacyDb.url && !legacyDb.connectionType) {
    const url = legacyDb.url as string;
    let connectionType: RemoteConnectionType = 'url';

    // Infer connection type from URL
    if (url.startsWith('md:')) {
      connectionType = 'motherduck';
    } else if (url.startsWith('s3://') || url.startsWith('gs://') || url.includes('amazonaws.com')) {
      connectionType = 's3';
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      connectionType = 'http';
    }

    return {
      ...legacyDb,
      connectionType,
      legacyUrl: url,
      queryEngineType: 'duckdb',
      supportedPlatforms: getSupportedPlatforms(connectionType),
      requiresProxy: requiresProxy(connectionType),
      // Remove old fields for cleaner interface
      url: undefined,
      dbType: undefined,
    };
  }

  return legacyDb as RemoteDB;
}

/**
 * Creates a new RemoteDB instance for connection-based databases (Postgres/MySQL)
 */
export function createConnectionBasedRemoteDB(
  id: PersistentDataSourceId,
  connectionId: string,
  connectionType: 'postgres' | 'mysql',
  dbName: string,
  instanceName?: string,
  instanceId?: string,
  comment?: string
): RemoteDB {
  return {
    type: 'remote-db',
    id,
    connectionType,
    connectionId,
    dbName,
    queryEngineType: 'duckdb',
    supportedPlatforms: getSupportedPlatforms(connectionType),
    requiresProxy: requiresProxy(connectionType),
    connectionState: 'connecting',
    attachedAt: Date.now(),
    comment,
    instanceName,
    instanceId,
  };
}

/**
 * Creates a new RemoteDB instance for URL-based databases (legacy)
 */
export function createUrlBasedRemoteDB(
  id: PersistentDataSourceId,
  url: string,
  dbName: string,
  comment?: string,
  instanceName?: string,
  instanceId?: string
): RemoteDB {
  let connectionType: RemoteConnectionType = 'url';

  // Infer connection type from URL
  if (url.startsWith('md:')) {
    connectionType = 'motherduck';
  } else if (url.startsWith('s3://') || url.startsWith('gs://') || url.includes('amazonaws.com')) {
    connectionType = 's3';
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    connectionType = 'http';
  }

  return {
    type: 'remote-db',
    id,
    connectionType,
    legacyUrl: url,
    dbName,
    queryEngineType: 'duckdb',
    supportedPlatforms: getSupportedPlatforms(connectionType),
    requiresProxy: requiresProxy(connectionType),
    connectionState: 'connecting',
    attachedAt: Date.now(),
    comment,
    instanceName,
    instanceId,
  };
}

// Special constant for the system database
export const SYSTEM_DATABASE_ID = 'pondpilot-system-db' as PersistentDataSourceId;
export const SYSTEM_DATABASE_NAME = PERSISTENT_DB_NAME;

// Empty file source ID for system database
export const SYSTEM_DATABASE_FILE_SOURCE_ID = '' as LocalEntryId;
