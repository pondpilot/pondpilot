import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { MotherDuckConnection } from '@models/data-source';
import { makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { makePersistentDataSourceId } from '@utils/data-source';
import {
  loadMotherDuckExtension,
  connectMotherDuck,
  detachMotherDuckDatabases,
  listMotherDuckDatabases,
  getMotherDuckDatabaseModel,
} from '@utils/motherduck';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { useState, useCallback, useRef } from 'react';

export function useMotherDuckConnection(pool: AsyncDuckDBConnectionPool | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Synchronous refs guard against double-click races. React state updates
  // are batched asynchronously, so two rapid clicks could both see
  // isLoading/isTesting as false. The refs are updated immediately.
  const testingRef = useRef(false);
  const loadingRef = useRef(false);

  const testConnection = useCallback(
    async (token: string): Promise<boolean> => {
      if (!pool || testingRef.current || loadingRef.current) return false;
      testingRef.current = true;

      setIsTesting(true);

      const finishTesting = async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        testingRef.current = false;
        setIsTesting(false);
      };

      try {
        await loadMotherDuckExtension(pool);
        await connectMotherDuck(pool, token);

        // Clean up test connection
        await detachMotherDuckDatabases(pool);

        showSuccess({
          title: 'Connection successful',
          message: 'MotherDuck connection test passed',
        });

        await finishTesting();
        return true;
      } catch (error) {
        const message = sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
        showError({
          title: 'Connection failed',
          message: `Failed to connect: ${message}`,
        });

        // Best-effort cleanup
        try {
          await detachMotherDuckDatabases(pool);
        } catch {
          // Ignore cleanup errors
        }

        await finishTesting();
        return false;
      }
    },
    [pool],
  );

  const addConnection = useCallback(
    async (token: string, onClose: () => void): Promise<boolean> => {
      if (!pool || loadingRef.current || testingRef.current) return false;
      loadingRef.current = true;

      setIsLoading(true);
      const secretRefId = makeSecretId();
      const { _iDbConn: iDbConn } = useAppStore.getState();
      let secretPersisted = false;

      try {
        // Store token in the encrypted secret store.
        // If iDbConn is unavailable (e.g. IndexedDB not initialized), the token
        // won't be persisted. On next app load the connection will transition to
        // 'credentials-required' and the user will need to re-enter the token.
        if (iDbConn) {
          await putSecret(iDbConn, secretRefId, {
            label: 'MotherDuck',
            data: { token },
          });
          secretPersisted = true;
        }

        const connection: MotherDuckConnection = {
          type: 'motherduck',
          id: makePersistentDataSourceId(),
          connectionState: 'connecting',
          attachedAt: Date.now(),
          secretRef: secretRefId,
        };

        // Load extension and connect
        await loadMotherDuckExtension(pool);
        await connectMotherDuck(pool, token);

        connection.connectionState = 'connected';

        const { dataSources, databaseMetadata } = useAppStore.getState();
        const newDataSources = new Map(dataSources);
        newDataSources.set(connection.id, connection);

        // Load metadata for discovered MotherDuck databases
        try {
          const mdDatabases = await listMotherDuckDatabases(pool);
          const dbNames = mdDatabases.map((db) => db.name);

          if (dbNames.length > 0) {
            const remoteMetadata = await getMotherDuckDatabaseModel(pool, dbNames);
            const newMetadata = new Map(databaseMetadata);
            for (const [dbName, dbModel] of remoteMetadata) {
              newMetadata.set(dbName, dbModel);
            }
            useAppStore.setState(
              { dataSources: newDataSources, databaseMetadata: newMetadata },
              false,
              'DatasourceWizard/addMotherDuck',
            );
          } else {
            useAppStore.setState(
              { dataSources: newDataSources },
              false,
              'DatasourceWizard/addMotherDuck',
            );
          }
        } catch (metadataError) {
          console.error('Failed to load MotherDuck metadata:', metadataError);
          useAppStore.setState(
            { dataSources: newDataSources },
            false,
            'DatasourceWizard/addMotherDuck',
          );
        }

        // Persist connection to IndexedDB
        const { _iDbConn: currentIDbConn } = useAppStore.getState();
        if (currentIDbConn) {
          await persistPutDataSources(currentIDbConn, [connection]);
        }

        showSuccess({
          title: 'Connected',
          message: 'Successfully connected to MotherDuck',
        });
        onClose();
        return true;
      } catch (error) {
        const message = sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
        showError({
          title: 'Failed to connect',
          message: `Error: ${message}`,
        });

        // Best-effort cleanup
        try {
          await detachMotherDuckDatabases(pool);
        } catch {
          // Ignore cleanup errors
        }

        if (secretPersisted && iDbConn) {
          try {
            const { deleteSecret } = await import('@services/secret-store');
            await deleteSecret(iDbConn, secretRefId);
          } catch {
            // Ignore cleanup errors
          }
        }

        return false;
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    },
    [pool],
  );

  return { isLoading, isTesting, testConnection, addConnection };
}
