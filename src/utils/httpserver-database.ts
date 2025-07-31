/* eslint-disable no-console */
/**
 * HTTPServer Database Utilities
 *
 * Utilities for managing HTTPServer database connections and view cleanup
 */

import { showError, showWarning, showSuccess } from '@components/app-notifications';
import { deleteTab } from '@controllers/tab';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { HTTPServerDB, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { AnyTab, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { getTableColumnId } from '@utils/db';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { createHttpClient, DatabaseSchema } from '@utils/duckdb-http-client';
import { getCredentialsForServer } from '@utils/httpserver-credentials';

/**
 * Create HTTP client with credentials for HTTPServerDB
 */
function createAuthenticatedHttpClient(httpServerDb: HTTPServerDB) {
  const credentials = getCredentialsForServer(httpServerDb.id);

  return createHttpClient({
    host: httpServerDb.host,
    port: httpServerDb.port,
    protocol: 'http',
    authType: httpServerDb.authType,
    username: credentials?.username,
    password: credentials?.password,
    token: credentials?.token,
  });
}

/**
 * Checks if an error is a network-related error that indicates connection loss
 */
export function isNetworkError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';

  return (
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('Failed to load') ||
    errorMessage.includes("Failed to execute 'send'") ||
    errorMessage.includes('ERR_NETWORK') ||
    errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
    errorMessage.includes('Connection refused') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('ENETUNREACH')
  );
}

/**
 * Converts DatabaseSchema from HTTPServer client to DataBaseModel format
 */
function convertDatabaseSchemaToDataBaseModel(
  databaseName: string,
  schema: DatabaseSchema,
): DataBaseModel {
  return {
    name: databaseName,
    schemas: [
      {
        name: 'main', // HTTPServer uses main schema
        objects: schema.tables.map((table) => ({
          name: table.name,
          label: table.name,
          type: 'table' as const, // HTTPServer only has tables
          columns: table.columns.map((column, columnIndex) => ({
            name: column.name,
            databaseType: column.type,
            nullable: column.nullable,
            sqlType: normalizeDuckDBColumnType(column.type),
            id: getTableColumnId(column.name, columnIndex),
            columnIndex,
          })),
        })),
      },
    ],
  };
}

/**
 * Generates a deterministic view name for HTTPServer database table
 * Uses only dbName + tableName to ensure stable names across sessions
 */
export function generateHTTPServerViewName(
  dataSource: HTTPServerDB,
  schemaName: string,
  objectName: string,
): string {
  // Use only dbName and objectName for deterministic view names
  const sanitizedDb = dataSource.dbName.replace(/[-]/g, '_');
  const sanitizedObject = objectName.replace(/[-]/g, '_');
  return `httpserver_${sanitizedDb}_${sanitizedObject}`;
}

/**
 * Cleans up HTTPServer database views when tabs are closed
 */
export async function cleanupHTTPServerViews(
  pool: AsyncDuckDBConnectionPool,
  tabs: AnyTab[],
): Promise<void> {
  try {
    // Get all HTTPServer tabs that are being deleted
    const httpServerTabs = tabs.filter(
      (tab) => tab.type === 'data-source' && tab.dataSourceType === 'db',
    );

    if (httpServerTabs.length === 0) {
      return;
    }

    // Get current data sources to check which ones are HTTPServer
    const { dataSources } = useAppStore.getState();

    for (const tab of httpServerTabs) {
      if (tab.type === 'data-source' && tab.dataSourceType === 'db') {
        const dataSource = dataSources.get(tab.dataSourceId);

        if (dataSource?.type === 'httpserver-db') {
          const viewName = generateHTTPServerViewName(dataSource, tab.schemaName, tab.objectName);
          const dropViewSql = `DROP VIEW IF EXISTS ${toDuckDBIdentifier(viewName)}`;

          try {
            await pool.query(dropViewSql);
            console.log(`Cleaned up HTTPServer view: ${viewName}`);
          } catch (error) {
            console.warn(`Failed to cleanup HTTPServer view ${viewName}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during HTTPServer view cleanup:', error);
  }
}

/**
 * Creates a view for HTTPServer database table
 */
export async function createHTTPServerView(
  pool: AsyncDuckDBConnectionPool,
  dataSource: HTTPServerDB,
  schemaName: string,
  objectName: string,
): Promise<void> {
  const viewName = generateHTTPServerViewName(dataSource, schemaName, objectName);
  const tableName = toDuckDBIdentifier(objectName);
  const httpUrl = `http://${dataSource.host}:${dataSource.port}/?query=${encodeURIComponent(`SELECT * FROM ${tableName}`)}`;

  const createViewSql = `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM read_json_auto('${httpUrl}')`;

  try {
    await pool.query(createViewSql);
  } catch (error) {
    console.error(`Failed to create HTTPServer view ${viewName}:`, error);
    throw error;
  }
}

/**
 * Updates the connection state of an HTTPServerDB
 */
export function updateHTTPServerDbConnectionState(
  dbId: PersistentDataSourceId,
  state: HTTPServerDB['connectionState'],
  error?: string,
): void {
  const currentDataSources = useAppStore.getState().dataSources;
  const dataSource = currentDataSources.get(dbId);

  if (!dataSource || dataSource.type !== 'httpserver-db') {
    return;
  }

  const updatedDb: HTTPServerDB = {
    ...dataSource,
    connectionState: state,
    connectionError: error,
  };

  const newDataSources = new Map(currentDataSources);
  newDataSources.set(dbId, updatedDb);
  useAppStore.setState(
    { dataSources: newDataSources },
    false,
    'HTTPServerDB/updateConnectionState',
  );
}

/**
 * Refreshes HTTPServerDB schema from the server and updates local views
 */
export async function refreshHTTPServerSchema(
  pool: AsyncDuckDBConnectionPool,
  httpServerDb: HTTPServerDB,
): Promise<void> {
  try {
    // Create HTTP client with authentication
    const client = createAuthenticatedHttpClient(httpServerDb);

    // Fetch fresh schema from HTTP server
    const schema = await client.getSchema();

    // Convert schema to DataBaseModel format
    const dataBaseModel = convertDatabaseSchemaToDataBaseModel(httpServerDb.dbName, schema);

    // Get current metadata to compare
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const oldDataBaseModel = currentMetadata.get(httpServerDb.dbName);

    // Update metadata in the app state
    const newMetadata = new Map(currentMetadata);
    newMetadata.set(httpServerDb.dbName, dataBaseModel);
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'HTTPServerDB/refreshSchema');

    // Update views for open tabs
    const { tabs } = useAppStore.getState();
    const httpServerTabs: AnyTab[] = [];
    tabs.forEach((tab) => {
      if (
        tab.type === 'data-source' &&
        tab.dataSourceType === 'db' &&
        tab.dataSourceId === httpServerDb.id
      ) {
        httpServerTabs.push(tab);
      }
    });

    // Get list of existing tables from old metadata
    const oldTables = new Set<string>();
    if (oldDataBaseModel) {
      oldDataBaseModel.schemas.forEach((schemaModel) => {
        schemaModel.objects.forEach((obj) => {
          oldTables.add(obj.name);
        });
      });
    }

    // Get list of new tables from fresh metadata
    const newTables = new Set<string>();
    dataBaseModel.schemas.forEach((schemaModel) => {
      schemaModel.objects.forEach((obj) => {
        newTables.add(obj.name);
      });
    });

    // Create views for new tables that have open tabs
    for (const tab of httpServerTabs) {
      if (tab.type === 'data-source' && tab.dataSourceType === 'db') {
        const tableName = tab.objectName;

        // If this is a new table or existing table, recreate the view to ensure it's up to date
        if (newTables.has(tableName)) {
          const viewName = generateHTTPServerViewName(httpServerDb, tab.schemaName, tableName);
          const httpUrl = `http://${httpServerDb.host}:${httpServerDb.port}/?query=${encodeURIComponent(`SELECT * FROM ${toDuckDBIdentifier(tableName)}`)}`;
          const createViewSql = `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM read_json_auto('${httpUrl}')`;

          try {
            await pool.query(createViewSql);
            console.log(`Updated HTTPServer view: ${viewName}`);
          } catch (error) {
            console.error(`Failed to update HTTPServer view ${viewName}:`, error);
          }
        }
      }
    }

    showSuccess({
      title: 'Schema Refreshed',
      message: `Successfully refreshed schema for HTTP server database '${httpServerDb.dbName}'`,
    });
  } catch (error) {
    console.error('Failed to refresh HTTPServer schema:', error);
    showError({
      title: 'Refresh Failed',
      message: `Failed to refresh schema for HTTP server database '${httpServerDb.dbName}'`,
    });
    throw error;
  }
}

/**
 * Attempts to reconnect an HTTPServerDB
 */
export async function reconnectHTTPServerDatabase(httpServerDb: HTTPServerDB): Promise<boolean> {
  try {
    updateHTTPServerDbConnectionState(httpServerDb.id, 'connecting');

    // Test the connection with authentication
    const client = createAuthenticatedHttpClient(httpServerDb);

    const connectionResult = await client.testConnection();

    if (!connectionResult) {
      throw new Error('Connection test failed');
    }

    // Fetch and store metadata for tree building
    try {
      const schema = await client.getSchema();

      // Convert schema to DataBaseModel format
      const dataBaseModel = convertDatabaseSchemaToDataBaseModel(httpServerDb.dbName, schema);

      // Store metadata in the app state
      const currentMetadata = useAppStore.getState().databaseMetadata;
      const newMetadata = new Map(currentMetadata);
      newMetadata.set(httpServerDb.dbName, dataBaseModel);

      useAppStore.setState({ databaseMetadata: newMetadata }, false, 'HTTPServerDB/updateMetadata');
    } catch (metadataError) {
      console.warn(
        `Failed to fetch metadata for HTTPServerDB '${httpServerDb.dbName}':`,
        metadataError,
      );
      // Continue with connection success even if metadata fetch fails
    }

    updateHTTPServerDbConnectionState(httpServerDb.id, 'connected');

    showSuccess({
      title: 'Reconnected',
      message: `Successfully reconnected to HTTP server database '${httpServerDb.dbName}'`,
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    updateHTTPServerDbConnectionState(httpServerDb.id, 'error', errorMessage);

    showError({
      title: 'Connection Failed',
      message: `Failed to connect to HTTP server database '${httpServerDb.dbName}': ${errorMessage}`,
    });

    return false;
  }
}

// Per-connection error state tracking to prevent duplicate notifications
const connectionErrorStates = new Map<
  string,
  {
    lastErrorTime: number;
    errorShown: boolean;
    isRecovering: boolean;
  }
>();

/**
 * Clears error state for a specific connection (used when reconnecting)
 */
export function clearHTTPServerErrorState(dbId: PersistentDataSourceId): void {
  connectionErrorStates.delete(dbId);
}

/**
 * Handles errors when accessing HTTPServerDB
 */
export function handleHTTPServerDatabaseError(dbId: PersistentDataSourceId, error: Error): void {
  const errorMessage = error.message || String(error);
  const now = Date.now();
  const errorState = connectionErrorStates.get(dbId);

  // Only show notification if we haven't shown one recently for this connection (within 5 seconds)
  const shouldShowNotification = !errorState || now - errorState.lastErrorTime > 5000;

  // Check for common network errors using our helper
  if (isNetworkError(error)) {
    updateHTTPServerDbConnectionState(dbId, 'disconnected', 'Network connection lost');

    if (shouldShowNotification) {
      // Get the database name for better error messages
      const { dataSources } = useAppStore.getState();
      const dataSource = dataSources.get(dbId);
      const dbName =
        dataSource && dataSource.type === 'httpserver-db'
          ? dataSource.dbName
          : 'HTTP server database';

      showWarning({
        title: 'Connection Lost',
        message: `Lost connection to '${dbName}'. The server may be down or unreachable.`,
      });

      // Update error state tracking
      connectionErrorStates.set(dbId, {
        lastErrorTime: now,
        errorShown: true,
        isRecovering: false,
      });
    }
  } else if (
    errorMessage.includes('403') ||
    errorMessage.includes('401') ||
    errorMessage.includes('AccessDenied')
  ) {
    updateHTTPServerDbConnectionState(dbId, 'error', 'Access denied');

    if (shouldShowNotification) {
      showError({
        title: 'Access Denied',
        message: 'You do not have permission to access this HTTP server database.',
      });

      connectionErrorStates.set(dbId, {
        lastErrorTime: now,
        errorShown: true,
        isRecovering: false,
      });
    }
  } else {
    updateHTTPServerDbConnectionState(dbId, 'error', errorMessage);

    if (shouldShowNotification) {
      showError({
        title: 'Database Error',
        message: `Error accessing HTTP server database: ${errorMessage}`,
      });

      connectionErrorStates.set(dbId, {
        lastErrorTime: now,
        errorShown: true,
        isRecovering: false,
      });
    }
  }
}

/**
 * Disconnects an HTTPServerDB
 */
export async function disconnectHTTPServerDatabase(httpServerDb: HTTPServerDB): Promise<void> {
  try {
    // For HTTP servers, we don't need to detach anything - just update state
    updateHTTPServerDbConnectionState(httpServerDb.id, 'disconnected');

    // Remove database metadata
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    newMetadata.delete(httpServerDb.dbName);
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'HTTPServerDB/disconnect');

    // Close any open tabs related to this database
    const { tabs } = useAppStore.getState();
    const tabsToClose: TabId[] = [];

    for (const [tabId, tab] of tabs) {
      // Close data tabs that reference this database
      if (
        tab.type === 'data-source' &&
        tab.dataSourceType === 'db' &&
        tab.dataSourceId === httpServerDb.id
      ) {
        tabsToClose.push(tabId);
      }

      // Close schema browser tabs that reference this database
      if (
        tab.type === 'schema-browser' &&
        tab.sourceType === 'db' &&
        tab.sourceId === httpServerDb.id
      ) {
        tabsToClose.push(tabId);
      }
    }

    if (tabsToClose.length > 0) {
      deleteTab(tabsToClose);
    }

    showSuccess({
      title: 'Disconnected',
      message: `Successfully disconnected from HTTP server database '${httpServerDb.dbName}'`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    showError({
      title: 'Disconnection Failed',
      message: `Failed to disconnect from HTTP server database '${httpServerDb.dbName}': ${errorMessage}`,
    });

    // Still update state to disconnected as the user intended to disconnect
    updateHTTPServerDbConnectionState(httpServerDb.id, 'disconnected', errorMessage);
  }
}
