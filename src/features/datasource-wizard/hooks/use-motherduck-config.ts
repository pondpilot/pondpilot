import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { RemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { getErrorMessage } from '@utils/error-handling';
import { quote } from '@utils/helpers';
import { isMotherDuckUrl } from '@utils/url-helpers';
import { useCallback, useState, useEffect } from 'react';

import { SecretsAPI } from '../../../services/secrets-api';

export function useMotherDuckConfig(pool: ConnectionPool | null) {
  const [dbs, setDbs] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);
  const [selectedSecretId, setSelectedSecretId] = useState<string | null>(null);
  const [selectedSecretName, setSelectedSecretName] = useState<string | undefined>(undefined);

  const getConnectedDbNamesForInstance = useCallback(
    (instanceId: string | undefined, instanceName: string | undefined): Set<string> => {
      const { dataSources } = useAppStore.getState();
      const names = new Set<string>();
      for (const ds of dataSources.values()) {
        if (ds.type === 'remote-db') {
          const remoteDb = ds as RemoteDB;
          if (isMotherDuckUrl(remoteDb.legacyUrl)) {
            // Prefer instanceId for matching (stable), fall back to instanceName
            if (instanceId && remoteDb.instanceId === instanceId) {
              names.add(remoteDb.dbName);
            } else if (!instanceId && !remoteDb.instanceId) {
              // Backwards compatibility: match by name if neither has ID
              const dbInstanceName = remoteDb.instanceName || 'default';
              const currentInstanceName = instanceName || 'default';
              if (dbInstanceName === currentInstanceName) {
                names.add(remoteDb.dbName);
              }
            }
          }
        }
      }
      return names;
    },
    [],
  );

  // Simplified - we don't need complex detachment logic since we'll restart the app
  const detachAllMotherDuckDatabases = useCallback(async () => {
    // This function is no longer used since we handle disconnection and restart in the component
  }, []);

  const loadMotherDuckList = useCallback(async () => {
    if (!pool) {
      showError({ title: 'App not ready', message: 'Please wait for the app to initialize' });
      return;
    }

    if (!selectedSecretId) {
      showError({ title: 'No token selected', message: 'Please select a MotherDuck token first' });
      return;
    }

    setLoading(true);
    try {
      // IMPORTANT: Apply the secret BEFORE loading the extension
      // This ensures the extension uses the correct token
      await SecretsAPI.applySecretToConnection({
        connection_id: `motherduck_list_${Date.now()}`, // Use unique ID to force fresh application
        secret_id: selectedSecretId,
      });

      const conn = await pool.acquire();
      try {
        try {
          await conn.execute('INSTALL motherduck');
        } catch (e) {
          // Extension might already be installed
        }
        try {
          await conn.execute('LOAD motherduck');
        } catch (e) {
          // Extension loading issue
        }

        // No need to attach here - we'll query using md_information_schema directly

        // In single attachment mode, we need to attach at least one database to get md_information_schema
        // Try attaching a common default database name first
        let catalogDbName: string | null = null;
        const tryAttachForCatalog = async (dbName: string) => {
          try {
            await conn.execute(`ATTACH 'md:${dbName}'`);
            catalogDbName = dbName;
            return true;
          } catch (e) {
            return false;
          }
        };

        // Try common database names
        const catalogAttached =
          (await tryAttachForCatalog('my_db')) ||
          (await tryAttachForCatalog('main')) ||
          (await tryAttachForCatalog('default')) ||
          (await tryAttachForCatalog('dev')) ||
          (await tryAttachForCatalog('test'));

        if (!catalogAttached) {
          throw new Error(
            'Unable to list MotherDuck databases. Please ensure you have at least one database in your MotherDuck account.',
          );
        }

        let result;
        try {
          result = await conn.execute(
            'SELECT name FROM md_information_schema.databases ORDER BY name',
          );
        } catch (queryError) {
          console.error('[MotherDuck] Failed to query databases:', queryError);
          throw new Error(`Failed to list MotherDuck databases: ${queryError}`);
        }

        const options = result.rows.map((r: any) => r.name as string).filter(Boolean);
        setDbs(options);

        // Detach the catalog database if it was only for listing
        if (
          catalogDbName &&
          !getConnectedDbNamesForInstance(selectedSecretId || undefined, selectedSecretName).has(
            catalogDbName,
          )
        ) {
          try {
            await conn.execute(`DETACH DATABASE ${toDuckDBIdentifier(catalogDbName)}`);
          } catch (e) {
            // Could not detach catalog database
          }
        }

        const connectedForThisInstance = getConnectedDbNamesForInstance(
          selectedSecretId || undefined,
          selectedSecretName,
        );
        const initial = new Set<string>();
        for (const name of options) {
          if (!connectedForThisInstance.has(name)) {
            initial.add(name);
          }
        }
        setSelectedSet(initial);
      } finally {
        await pool.release(conn);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
      showError({ title: 'Failed to list MotherDuck databases', message: msg });
    } finally {
      setLoading(false);
    }
  }, [
    pool,
    selectedSecretId,
    selectedSecretName,
    getConnectedDbNamesForInstance,
    detachAllMotherDuckDatabases,
  ]);

  const handleAttach = useCallback(async () => {
    if (!pool) {
      showError({ title: 'App not ready', message: 'Please wait for the app to initialize' });
      return;
    }
    if (selectedSet.size === 0) return;

    if (!selectedSecretId) {
      showError({ title: 'No token selected', message: 'Please select a MotherDuck token first' });
      return;
    }

    setAttachLoading(true);
    try {
      const connectedForThisInstance = getConnectedDbNamesForInstance(
        selectedSecretId || undefined,
        selectedSecretName,
      );
      const namesToAttach = Array.from(selectedSet).filter((n) => !connectedForThisInstance.has(n));

      if (namesToAttach.length === 0) {
        showSuccess({ title: 'No action', message: 'Selected databases are already connected' });
        return;
      }

      const { dataSources, databaseMetadata } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      const attachedNames: string[] = [];

      // First, check what databases are already attached
      const attachedDbNames = new Set<string>();
      try {
        const checkConn = await pool.acquire();
        try {
          const result = await checkConn.execute('SELECT database_name FROM duckdb_databases');
          if (result && result.rows && result.rows.length > 0) {
            for (const row of result.rows) {
              if (row && row.database_name) {
                attachedDbNames.add(row.database_name.toString());
              }
            }
          }
        } finally {
          await pool.release(checkConn);
        }
      } catch (e) {
        console.warn('Failed to query existing databases:', e);
      }

      // IMPORTANT: Apply the secret BEFORE loading the extension
      await SecretsAPI.applySecretToConnection({
        connection_id: `motherduck_attach_${Date.now()}`, // Use unique ID to force fresh application
        secret_id: selectedSecretId,
      });
      console.info('[MotherDuck] Secret applied before attachment', {
        secretId: selectedSecretId,
        secretName: selectedSecretName,
        attaching: namesToAttach,
      });

      const conn = await pool.acquire();
      try {
        try {
          await conn.execute('LOAD motherduck');
        } catch (e) {
          // Extension loading might fail
        }

        // Check which databases are already attached
        const checkAttached = await conn.execute('SELECT database_name FROM duckdb_databases');
        const currentlyAttached = new Set(
          checkAttached.rows.map((row: any) => row.database_name as string),
        );

        const { ConnectionsAPI } = await import('../../../services/connections-api');

        console.info('[MotherDuck] Starting attachment batch', {
          dbCount: namesToAttach.length,
          namesToAttach,
        });

        // Attach each database individually
        for (const dbName of namesToAttach) {
          const dbUrl = `md:${dbName}`;

          const registerAttachment = async () => {
            try {
              await ConnectionsAPI.registerMotherDuckAttachment(
                dbUrl,
                selectedSecretId || undefined,
              );
              console.info('[MotherDuck] Registered attachment with backend', {
                dbName,
                secretId: selectedSecretId,
              });
            } catch (registerError) {
              console.error(
                `[MotherDuck] register_motherduck_attachment failed for ${dbName}`,
                registerError,
              );
              throw registerError;
            }
          };

          if (currentlyAttached.has(dbName)) {
            await registerAttachment();
            attachedNames.push(dbName);
            attachedDbNames.add(dbName);
            continue;
          }

          let dbIdentifier = '';
          let detachOnError = false;

          try {
            dbIdentifier = toDuckDBIdentifier(dbName);
            const attachQuery = `ATTACH '${dbUrl}'`;
            await conn.execute(attachQuery);
            detachOnError = true;

            const verifyQuery = `SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_catalog = ${quote(dbName, { single: true })} AND table_schema NOT IN ('information_schema', 'pg_catalog')`;
            try {
              await conn.execute(verifyQuery);
            } catch (verifyError) {
              const verifyMessage = getErrorMessage(verifyError);
              console.warn(
                `[MotherDuck] Verification query failed for ${dbName} (continuing): ${verifyMessage}`,
                { query: verifyQuery },
              );
            }

            await registerAttachment();
            detachOnError = false;
            attachedNames.push(dbName);
            attachedDbNames.add(dbName);
          } catch (e: any) {
            if (detachOnError && dbIdentifier) {
              try {
                await conn.execute(`DETACH ${dbIdentifier}`);
              } catch (detachError) {
                console.warn(
                  `[MotherDuck] Failed to detach ${dbName} after error:`,
                  detachError,
                );
              }
            }
            throw e;
          }
        }
      } finally {
        await pool.release(conn);
      }

      const created: RemoteDB[] = [];
      for (const dbName of attachedNames) {
        const rdb: RemoteDB = {
          type: 'remote-db',
          id: makePersistentDataSourceId(),
          legacyUrl: `md:${dbName}`, // Use legacyUrl for MotherDuck URL
          dbName,
          connectionType: 'motherduck', // Set connectionType to identify as MotherDuck
          queryEngineType: 'duckdb',
          supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'], // MotherDuck works on both platforms
          requiresProxy: false,
          connectionState: 'connected',
          attachedAt: Date.now(),
          instanceName: selectedSecretName,
          instanceId: selectedSecretId, // Use stable secret ID for grouping
        };
        newDataSources.set(rdb.id, rdb);
        created.push(rdb);

        // Register with backend for re-attachment on all connections
        try {
          const { ConnectionsAPI } = await import('../../../services/connections-api');
          await ConnectionsAPI.registerMotherDuckAttachment(
            `md:${dbName}`,
            selectedSecretId || undefined,
          );
        } catch (regError) {
          console.error(`[MotherDuck] Failed to register ${dbName} with backend:`, regError);
        }
      }

      try {
        const remoteMetadata = await getDatabaseModel(pool, attachedNames);
        const newMetadata = new Map(databaseMetadata);
        for (const [remoteDbName, dbModel] of remoteMetadata) {
          newMetadata.set(remoteDbName, dbModel);
        }
        useAppStore.setState(
          { dataSources: newDataSources, databaseMetadata: newMetadata },
          false,
          'DatasourceWizard/addMotherDuckDatabases',
        );
      } catch (e) {
        useAppStore.setState(
          { dataSources: newDataSources },
          false,
          'DatasourceWizard/addMotherDuckDatabases',
        );
      }

      const { _iDbConn, _persistenceAdapter } = useAppStore.getState();
      const persistTarget = _persistenceAdapter || _iDbConn;
      if (persistTarget && created.length) {
        await persistPutDataSources(persistTarget, created);
      }

      showSuccess({
        title: 'Databases added',
        message: `Attached ${attachedNames.length} MotherDuck DB(s)`,
      });

      return true; // Success
    } catch (error) {
      console.error('Failed to attach MotherDuck database batch:', {
        error,
        selectedSecretId,
        selectedSecretName,
        requestedDatabases: Array.from(selectedSet),
      });
      const msg = getErrorMessage(error);
      showError({ title: 'Failed to attach database', message: msg });
      return false; // Failure
    } finally {
      setAttachLoading(false);
    }
  }, [pool, selectedSet, selectedSecretId, selectedSecretName, getConnectedDbNamesForInstance]);

  useEffect(() => {
    if (selectedSecretId) {
      loadMotherDuckList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSecretId]);

  return {
    dbs,
    selectedSet,
    setSelectedSet,
    loading,
    attachLoading,
    selectedSecretId,
    setSelectedSecretId,
    selectedSecretName,
    setSelectedSecretName,
    loadMotherDuckList,
    handleAttach,
    getConnectedDbNamesForInstance,
  };
}
