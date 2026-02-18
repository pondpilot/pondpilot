import { PERSISTENT_DB_NAME } from './db-persistence';
import { LocalEntryId, ReadStatViewType } from './file-system';
import { NewId } from './new-id';
import type { SecretId } from '../services/secret-store';

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

export interface ReadStatView extends FlatFileDataSource {
  readonly type: ReadStatViewType;
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

export type GSheetAccessMode = 'public' | 'authorized';

/**
 * Google Sheets spreadsheet tabs are represented as managed DuckDB views.
 *
 * Unlike local files, these sources do not point to a persisted local file handle.
 * `fileSourceId` is used as a stable grouping key for all tabs that belong to the
 * same spreadsheet connection.
 */
export interface GSheetSheetView extends FlatFileDataSource {
  readonly type: 'gsheet-sheet';
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  exportUrl: string;
  sheetName: string;
  accessMode: GSheetAccessMode;
  /**
   * Optional reference to an encrypted secret that stores the per-connection
   * Google access token for authorized sheet reads.
   */
  secretRef?: SecretId;
}

export type AnyFlatFileDataSource =
  | CSVView
  | ParquetView
  | XlsxSheetView
  | JSONView
  | ReadStatView
  | GSheetSheetView;

export type IcebergAuthType = 'oauth2' | 'bearer' | 'sigv4' | 'none';

export interface IcebergCatalog {
  readonly type: 'iceberg-catalog';
  id: PersistentDataSourceId;

  /**
   * Name used in the ATTACH ... AS clause
   */
  catalogAlias: string;

  /**
   * Warehouse value passed to ATTACH
   */
  warehouseName: string;

  /**
   * REST catalog endpoint URL
   */
  endpoint: string;

  /**
   * Authentication type for the catalog
   */
  authType: IcebergAuthType;

  /**
   * Connection state for handling network issues
   */
  connectionState: 'connected' | 'disconnected' | 'error' | 'connecting' | 'credentials-required';

  /**
   * Error message if connection failed
   */
  connectionError?: string;

  /**
   * Timestamp of when this catalog was attached
   */
  attachedAt: number;

  /**
   * Optional comment/description
   */
  comment?: string;

  /**
   * Whether to use CORS proxy when connecting
   */
  useCorsProxy?: boolean;

  /**
   * DuckDB secret name for drop/recreate
   */
  secretName: string;

  /**
   * Endpoint type for managed services (GLUE, S3_TABLES)
   */
  endpointType?: 'GLUE' | 'S3_TABLES';

  /**
   * Default AWS region for SigV4 auth
   */
  defaultRegion?: string;

  /**
   * OAuth2 server URI for token exchange
   */
  oauth2ServerUri?: string;

  // ──────────────────────────────────────────────────────────────────
  // SECURITY NOTE: Credentials are encrypted in the secret store
  // (AES-GCM with a non-extractable key). The `secretRef` field
  // references the encrypted record. Inline credential fields below
  // are kept for backward compatibility with catalogs created before
  // the secret store was introduced. On restore, inline credentials
  // are migrated into the secret store automatically.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Reference to the encrypted secret store entry holding credentials.
   * When present, inline credential fields are ignored.
   */
  secretRef?: SecretId;

  /** @deprecated Use secretRef. OAuth2 client ID */
  clientId?: string;

  /** @deprecated Use secretRef. OAuth2 client secret */
  clientSecret?: string;

  /** @deprecated Use secretRef. Bearer token */
  token?: string;

  /** @deprecated Use secretRef. AWS access key ID */
  awsKeyId?: string;

  /** @deprecated Use secretRef. AWS secret access key */
  awsSecret?: string;
}

export interface LocalDB extends SingleFileDataSourceBase {
  readonly type: 'attached-db';

  /**
   * Type of the database.
   */
  dbType: 'duckdb' | 'sqllite';

  /**
   * valid unique identifier used to attach db as
   */
  dbName: string;
}

/**
 * Remote database attached via URL (HTTPS, S3, etc.)
 * These databases are read-only and accessed over the network
 */
export interface RemoteDB {
  readonly type: 'remote-db';

  /**
   * Unique identifier for the remote database
   */
  id: PersistentDataSourceId;

  /**
   * URL of the remote database (e.g., https://..., s3://...)
   */
  url: string;

  /**
   * Database name used in ATTACH statement
   */
  dbName: string;

  /**
   * Type of the database (always duckdb for now)
   */
  dbType: 'duckdb';

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
   * Whether to use CORS proxy when connecting to this remote database
   */
  useCorsProxy?: boolean;

  /**
   * Custom S3 endpoint for non-AWS S3-compatible services (e.g., MinIO).
   * Only used when URL starts with s3:// and useCorsProxy is true.
   * Example: 'minio.example.com:9000'
   */
  s3Endpoint?: string;
}

export type AnyDataSource = AnyFlatFileDataSource | LocalDB | RemoteDB | IcebergCatalog;

// Special constant for the system database
export const SYSTEM_DATABASE_ID = 'pondpilot-system-db' as PersistentDataSourceId;
export const SYSTEM_DATABASE_NAME = PERSISTENT_DB_NAME;

// Empty file source ID for system database
export const SYSTEM_DATABASE_FILE_SOURCE_ID = '' as LocalEntryId;
