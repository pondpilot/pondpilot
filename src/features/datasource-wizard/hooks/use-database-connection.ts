import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { createConnectionBasedRemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { getPlatformContext, getConnectionCapability } from '@utils/platform-capabilities';
import { useCallback, useState } from 'react';

import { ConnectionType, SslMode } from '../../../models/connections';
import { ConnectionsAPI } from '../../../services/connections-api';

interface DatabaseConnectionConfig {
  name: string;
  host: string;
  port: number;
  database: string;
  sslMode?: string; // For PostgreSQL
}

interface DatabaseConnectionState {
  config: DatabaseConnectionConfig;
  secretId: string | null;
  secretName?: string;
}

export function useDatabaseConnection(
  pool: ConnectionPool | null,
  databaseType: 'postgres' | 'mysql',
) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const testConnection = useCallback(
    async (state: DatabaseConnectionState): Promise<boolean> => {
      if (!pool) {
        showError({ title: 'App not ready', message: 'Please wait for the app to initialize' });
        return false;
      }

      if (!state.secretId) {
        showError({
          title: 'No credentials selected',
          message: 'Please select database credentials first',
        });
        return false;
      }

      // Check platform capability for this database type
      const platformContext = getPlatformContext();
      const connectionType = databaseType === 'postgres' ? 'postgres' : 'mysql';
      const capability = getConnectionCapability(connectionType, platformContext);

      if (!capability.supported) {
        showError({
          title: 'Connection not supported',
          message:
            capability.reason ||
            `${databaseType === 'postgres' ? 'PostgreSQL' : 'MySQL'} connections are not supported on this platform`,
        });
        return false;
      }

      const { config } = state;
      if (!config.name.trim() || !config.host.trim() || !config.database.trim()) {
        showError({
          title: 'Validation error',
          message: 'Please fill in all required fields: name, host, and database',
        });
        return false;
      }

      setIsTesting(true);
      try {
        // Convert string ssl_mode to SslMode enum
        let sslMode: SslMode | undefined;
        if (config.sslMode) {
          switch (config.sslMode) {
            case 'disable':
              sslMode = SslMode.Disable;
              break;
            case 'allow':
              sslMode = SslMode.Allow;
              break;
            case 'prefer':
              sslMode = SslMode.Prefer;
              break;
            case 'require':
              sslMode = SslMode.Require;
              break;
            case 'verify-ca':
              sslMode = SslMode.VerifyCa;
              break;
            case 'verify-full':
              sslMode = SslMode.VerifyFull;
              break;
            default:
              sslMode = SslMode.Prefer;
              break;
          }
        }

        // Use the backend API to test the connection with the secret
        const connectionTestConfig = {
          name: config.name,
          connection_type:
            databaseType === 'postgres' ? ConnectionType.Postgres : ConnectionType.MySQL,
          host: config.host,
          port: config.port,
          database: config.database,
          read_only: undefined,
          ssl_mode: sslMode,
        };

        const success = await ConnectionsAPI.testDatabaseConnectionConfig(
          connectionTestConfig,
          state.secretId,
        );

        if (success) {
          showSuccess({
            title: 'Connection successful',
            message: `Successfully connected to ${databaseType === 'postgres' ? 'PostgreSQL' : 'MySQL'} database`,
          });
          return true;
        }
        showError({
          title: 'Connection failed',
          message: 'Could not establish connection to the database',
        });
        return false;
      } catch (error) {
        console.error('Database connection test error:', error);
        let message = 'An unexpected error occurred';

        if (error instanceof Error) {
          message = error.message;
        } else if (typeof error === 'string') {
          message = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
          message = String(error.message);
        }

        showError({
          title: 'Connection failed',
          message: `Failed to connect to ${databaseType === 'postgres' ? 'PostgreSQL' : 'MySQL'}: ${message}`,
        });
        return false;
      } finally {
        setIsTesting(false);
      }
    },
    [pool, databaseType],
  );

  const saveConnection = useCallback(
    async (state: DatabaseConnectionState): Promise<boolean> => {
      if (!pool) {
        showError({ title: 'App not ready', message: 'Please wait for the app to initialize' });
        return false;
      }

      if (!state.secretId) {
        showError({
          title: 'No credentials selected',
          message: 'Please select database credentials first',
        });
        return false;
      }

      // Check platform capability for this database type
      const platformContext = getPlatformContext();
      const connectionType = databaseType === 'postgres' ? 'postgres' : 'mysql';
      const capability = getConnectionCapability(connectionType, platformContext);

      if (!capability.supported) {
        showError({
          title: 'Connection not supported',
          message:
            capability.reason ||
            `${databaseType === 'postgres' ? 'PostgreSQL' : 'MySQL'} connections are not supported on this platform`,
        });
        return false;
      }

      const { config } = state;
      if (!config.name.trim() || !config.host.trim() || !config.database.trim()) {
        showError({
          title: 'Validation error',
          message: 'Please fill in all required fields: name, host, and database',
        });
        return false;
      }

      setIsConnecting(true);
      try {
        // Save the connection configuration first
        const savedConnection = await ConnectionsAPI.saveConnection({
          name: config.name.trim(),
          connection_type:
            databaseType === 'postgres' ? ConnectionType.Postgres : ConnectionType.MySQL,
          host: config.host,
          port: config.port,
          database: config.database,
          secret_id: state.secretId,
          read_only: undefined,
          ssl_mode: config.sslMode
            ? config.sslMode === 'disable'
              ? SslMode.Disable
              : config.sslMode === 'allow'
                ? SslMode.Allow
                : config.sslMode === 'prefer'
                  ? SslMode.Prefer
                  : config.sslMode === 'require'
                    ? SslMode.Require
                    : config.sslMode === 'verify-ca'
                      ? SslMode.VerifyCa
                      : config.sslMode === 'verify-full'
                        ? SslMode.VerifyFull
                        : SslMode.Prefer
            : undefined,
          connect_timeout: undefined,
          query_timeout: undefined,
          max_connections: undefined,
          schema: undefined,
          tags: [],
          description: undefined,
        });

        // Create the RemoteDB object using the new helper function
        const remoteDb = createConnectionBasedRemoteDB(
          makePersistentDataSourceId(),
          savedConnection.id,
          databaseType as 'postgres' | 'mysql',
          config.name.trim(),
          state.secretName,
          state.secretId,
          `${databaseType === 'postgres' ? 'PostgreSQL' : 'MySQL'} database at ${config.host}:${config.port}`,
        );

        const { dataSources, databaseMetadata } = useAppStore.getState();
        const newDataSources = new Map(dataSources);
        newDataSources.set(remoteDb.id, remoteDb);

        // Use the backend command to attach the database with proper secrets
        const attachedDbName = toDuckDBIdentifier(remoteDb.dbName);
        await ConnectionsAPI.attachRemoteDatabase(savedConnection.id, attachedDbName);

        remoteDb.connectionState = 'connected';
        newDataSources.set(remoteDb.id, remoteDb);

        // Load metadata using the same identifier that was used for attachment
        try {
          const remoteMetadata = await getDatabaseModel(pool, [attachedDbName]);
          const newMetadata = new Map(databaseMetadata);
          for (const [_remoteDbName, dbModel] of remoteMetadata) {
            // IMPORTANT: Store metadata with the original dbName, not the quoted identifier
            // The tree builder looks for metadata using remoteDb.dbName (raw name)
            newMetadata.set(remoteDb.dbName, dbModel);
          }
          useAppStore.setState(
            { dataSources: newDataSources, databaseMetadata: newMetadata },
            false,
            `DatasourceWizard/add${databaseType === 'postgres' ? 'Postgres' : 'MySQL'}Database`,
          );
        } catch (metadataError) {
          console.error('Failed to load metadata:', metadataError);
          useAppStore.setState(
            { dataSources: newDataSources },
            false,
            `DatasourceWizard/add${databaseType === 'postgres' ? 'Postgres' : 'MySQL'}Database`,
          );
        }

        // Persist the data source
        const { _iDbConn, _persistenceAdapter } = useAppStore.getState();
        const target = _persistenceAdapter || _iDbConn;
        if (target) {
          await persistPutDataSources(target, [remoteDb]);
        }

        showSuccess({
          title: 'Database added',
          message: `Successfully connected to ${databaseType === 'postgres' ? 'PostgreSQL' : 'MySQL'} database '${remoteDb.dbName}'`,
        });
        return true;
      } catch (error) {
        console.error('Database save error:', error);
        let message = 'An unexpected error occurred';

        if (error instanceof Error) {
          message = error.message;
        } else if (typeof error === 'string') {
          message = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
          message = String(error.message);
        }

        showError({
          title: 'Failed to add database',
          message: `Error connecting to ${databaseType === 'postgres' ? 'PostgreSQL' : 'MySQL'}: ${message}`,
        });
        return false;
      } finally {
        setIsConnecting(false);
      }
    },
    [pool, databaseType],
  );

  return {
    testConnection,
    saveConnection,
    isConnecting,
    isTesting,
  };
}
