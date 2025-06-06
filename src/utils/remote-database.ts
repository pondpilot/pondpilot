/**
 * Remote Database Utilities
 *
 * Utilities for managing remote database connections and error handling
 */

import { showError, showWarning, showSuccess } from '@components/app-notifications';
import { deleteTab } from '@controllers/tab';
import { RemoteDB, PersistentDataSourceId } from '@models/data-source';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { MaxRetriesExceededError } from '@utils/connection-errors';
import { executeWithRetry } from '@utils/connection-manager';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { buildDetachQuery } from '@utils/sql-builder';

/**
 * Updates the connection state of a remote database
 */
export function updateRemoteDbConnectionState(
  dbId: PersistentDataSourceId,
  state: RemoteDB['connectionState'],
  error?: string,
): void {
  const currentDataSources = useAppStore.getState().dataSources;
  const dataSource = currentDataSources.get(dbId);

  if (!dataSource || dataSource.type !== 'remote-db') {
    return;
  }

  const updatedDb: RemoteDB = {
    ...dataSource,
    connectionState: state,
    connectionError: error,
  };

  const newDataSources = new Map(currentDataSources);
  newDataSources.set(dbId, updatedDb);
  useAppStore.setState({ dataSources: newDataSources }, false, 'RemoteDB/updateConnectionState');
}

/**
 * Attempts to reconnect a remote database
 */
export async function reconnectRemoteDatabase(pool: any, remoteDb: RemoteDB): Promise<boolean> {
  try {
    updateRemoteDbConnectionState(remoteDb.id, 'connecting');

    // Test the connection by querying the database (using proper SQL escaping)
    const escapedDbName = toDuckDBIdentifier(remoteDb.dbName);
    const testQuery = `SELECT 1 FROM ${escapedDbName}.information_schema.tables LIMIT 1`;

    // Use connection manager with retries and timeout
    await executeWithRetry(pool, testQuery, {
      maxRetries: 3,
      timeout: 30000, // 30 seconds
      retryDelay: 2000, // 2 seconds
      exponentialBackoff: true,
    });

    updateRemoteDbConnectionState(remoteDb.id, 'connected');

    showSuccess({
      title: 'Reconnected',
      message: `Successfully reconnected to remote database '${remoteDb.dbName}'`,
    });

    return true;
  } catch (error) {
    let errorMessage: string;

    if (error instanceof MaxRetriesExceededError) {
      errorMessage = `Connection timeout after ${error.attempts} attempts: ${error.lastError.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    updateRemoteDbConnectionState(remoteDb.id, 'error', errorMessage);

    showError({
      title: 'Connection Failed',
      message: `Failed to connect to remote database '${remoteDb.dbName}': ${errorMessage}`,
    });

    return false;
  }
}

/**
 * Handles errors when accessing remote databases
 */
export function handleRemoteDatabaseError(dbId: PersistentDataSourceId, error: Error): void {
  const errorMessage = error.message || String(error);

  // Check for common network errors
  if (
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('ERR_NETWORK') ||
    errorMessage.includes('ERR_INTERNET_DISCONNECTED')
  ) {
    updateRemoteDbConnectionState(dbId, 'disconnected', 'Network connection lost');

    showWarning({
      title: 'Connection Lost',
      message: 'Lost connection to remote database. Please check your internet connection.',
    });
  } else if (
    errorMessage.includes('403') ||
    errorMessage.includes('401') ||
    errorMessage.includes('AccessDenied')
  ) {
    updateRemoteDbConnectionState(dbId, 'error', 'Access denied');

    showError({
      title: 'Access Denied',
      message: 'You do not have permission to access this remote database.',
    });
  } else {
    updateRemoteDbConnectionState(dbId, 'error', errorMessage);

    showError({
      title: 'Database Error',
      message: `Error accessing remote database: ${errorMessage}`,
    });
  }
}

/**
 * Allowed protocols for remote databases
 */
const ALLOWED_REMOTE_PROTOCOLS = [
  'https:', // HTTPS only (not HTTP for security)
  's3:', // Amazon S3
  'gcs:', // Google Cloud Storage
  'azure:', // Azure Blob Storage
] as const;

/**
 * Validates a remote database URL for security and format
 */
export function validateRemoteDatabaseUrl(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string' };
  }

  // Check for potentially dangerous patterns
  if (url.includes('..') || url.includes('\\')) {
    return { isValid: false, error: 'URL contains invalid path characters' };
  }

  // Prevent local file access
  if (url.startsWith('file://') || url.startsWith('/') || url.match(/^[a-zA-Z]:\\/)) {
    return { isValid: false, error: 'Local file paths are not allowed for remote databases' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!ALLOWED_REMOTE_PROTOCOLS.includes(parsedUrl.protocol as any)) {
    return {
      isValid: false,
      error: `Protocol "${parsedUrl.protocol}" is not allowed. Allowed protocols: ${ALLOWED_REMOTE_PROTOCOLS.join(', ')}`,
    };
  }

  // Additional validation for specific protocols
  if (parsedUrl.protocol === 'https:') {
    // Ensure hostname is present
    if (!parsedUrl.hostname) {
      return { isValid: false, error: 'HTTPS URLs must have a valid hostname' };
    }

    // Prevent localhost/loopback access for security
    if (
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === '::1' ||
      parsedUrl.hostname.startsWith('192.168.') ||
      parsedUrl.hostname.startsWith('10.') ||
      parsedUrl.hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    ) {
      return { isValid: false, error: 'Private/local network addresses are not allowed' };
    }
  }

  // Cloud storage validation
  if (parsedUrl.protocol === 's3:' && !parsedUrl.pathname.includes('/')) {
    return { isValid: false, error: 'S3 URLs must include a bucket and path' };
  }

  if (parsedUrl.protocol === 'gcs:' && !parsedUrl.pathname.includes('/')) {
    return { isValid: false, error: 'GCS URLs must include a bucket and path' };
  }

  if (parsedUrl.protocol === 'azure:' && !parsedUrl.pathname.includes('/')) {
    return { isValid: false, error: 'Azure URLs must include a container and path' };
  }

  return { isValid: true };
}

/**
 * Sanitizes a remote database URL by normalizing it and removing credentials
 */
export function sanitizeRemoteDatabaseUrl(url: string): string {
  const validation = validateRemoteDatabaseUrl(url);
  if (!validation.isValid) {
    throw new Error(`Invalid remote database URL: ${validation.error}`);
  }

  // Normalize the URL
  const parsedUrl = new URL(url);

  // Remove any fragment or excessive query parameters that might be risky
  parsedUrl.hash = '';

  // Strip credentials for security (they'll be handled separately by DuckDB)
  parsedUrl.username = '';
  parsedUrl.password = '';

  // For HTTPS URLs, normalize the path
  if (parsedUrl.protocol === 'https:') {
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+/g, '/');
  }

  return parsedUrl.toString();
}

/**
 * Checks if a database path is a remote URL
 */
export function isRemoteDatabasePath(path: string): boolean {
  const validation = validateRemoteDatabaseUrl(path);
  return validation.isValid;
}

/**
 * Disconnects a remote database
 */
export async function disconnectRemoteDatabase(pool: any, remoteDb: RemoteDB): Promise<void> {
  try {
    // DETACH the database
    const detachQuery = buildDetachQuery(remoteDb.dbName, true);
    await pool.query(detachQuery);

    // Update connection state to disconnected
    updateRemoteDbConnectionState(remoteDb.id, 'disconnected');

    // Remove database metadata
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    newMetadata.delete(remoteDb.dbName);
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'RemoteDB/disconnect');

    // Close any open tabs related to this database
    const { tabs } = useAppStore.getState();
    const tabsToClose: TabId[] = [];

    for (const [tabId, tab] of tabs) {
      // Close data tabs that reference this database
      if (
        tab.type === 'data-source' &&
        tab.dataSourceType === 'db' &&
        tab.dataSourceId === remoteDb.id
      ) {
        tabsToClose.push(tabId);
      }

      // Close schema browser tabs that reference this database
      if (
        tab.type === 'schema-browser' &&
        tab.sourceType === 'db' &&
        tab.sourceId === remoteDb.id
      ) {
        tabsToClose.push(tabId);
      }
    }

    if (tabsToClose.length > 0) {
      deleteTab(tabsToClose);
    }

    showSuccess({
      title: 'Disconnected',
      message: `Successfully disconnected from remote database '${remoteDb.dbName}'`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    showError({
      title: 'Disconnection Failed',
      message: `Failed to disconnect from remote database '${remoteDb.dbName}': ${errorMessage}`,
    });

    // Still update state to disconnected as the user intended to disconnect
    updateRemoteDbConnectionState(remoteDb.id, 'disconnected', errorMessage);
  }
}

/**
 * Gets a display name for a remote database URL
 */
export function getRemoteDatabaseDisplayName(url: string): string {
  // Validate the URL first
  const validation = validateRemoteDatabaseUrl(url);
  if (!validation.isValid) {
    return url.length > 50 ? `${url.substring(0, 47)}...` : url;
  }

  try {
    const parsedUrl = new URL(url);

    switch (parsedUrl.protocol) {
      case 's3:': {
        const s3Parts = parsedUrl.pathname.substring(1).split('/');
        return `S3: ${s3Parts[0]}`;
      }

      case 'https:':
        return parsedUrl.hostname;

      case 'gcs:': {
        const gcsPath = parsedUrl.pathname.startsWith('/')
          ? parsedUrl.pathname.substring(1)
          : parsedUrl.pathname;
        const gcsParts = gcsPath.split('/');
        return `GCS: ${gcsParts[0]}`;
      }

      case 'azure:': {
        const azurePath = parsedUrl.pathname.startsWith('/')
          ? parsedUrl.pathname.substring(1)
          : parsedUrl.pathname;
        const azureParts = azurePath.split('/');
        return `Azure: ${azureParts[0]}`;
      }

      default:
        return parsedUrl.hostname || parsedUrl.href;
    }
  } catch {
    // If URL parsing fails, return a truncated version
    return url.length > 50 ? `${url.substring(0, 47)}...` : url;
  }
}
