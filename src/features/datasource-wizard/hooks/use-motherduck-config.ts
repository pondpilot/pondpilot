import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { RemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { makePersistentDataSourceId } from '@utils/data-source';
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
          if (isMotherDuckUrl(remoteDb.url)) {
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
    console.log('[MotherDuck] Detach function called - app will restart for clean connection');
  }, []);

  const loadMotherDuckList = useCallback(async () => {
    console.log('[MotherDuck] loadMotherDuckList called');
    console.log('[MotherDuck] Pool available:', !!pool);
    console.log('[MotherDuck] Selected secret ID:', selectedSecretId);

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
      console.log('[MotherDuck] Applying secret to set environment variable');
      await SecretsAPI.applySecretToConnection({
        connection_id: `motherduck_list_${Date.now()}`, // Use unique ID to force fresh application
        secret_id: selectedSecretId,
      });
      console.log('[MotherDuck] Environment variable set');

      const conn = await pool.acquire();
      console.log('[MotherDuck] Acquired connection for listing');
      try {
        try {
          console.log('[MotherDuck] Installing motherduck extension');
          await conn.execute('INSTALL motherduck');
          console.log('[MotherDuck] Extension installed');
        } catch (e) {
          console.log('[MotherDuck] Extension might already be installed:', e);
        }
        try {
          console.log('[MotherDuck] Loading motherduck extension');
          await conn.execute('LOAD motherduck');
          console.log('[MotherDuck] Extension loaded');
        } catch (e) {
          console.log('[MotherDuck] Extension loading issue:', e);
        }

        // No need to attach here - we'll query using md_information_schema directly

        // In single attachment mode, we need to attach at least one database to get md_information_schema
        // Try attaching a common default database name first
        let catalogDbName: string | null = null;
        const tryAttachForCatalog = async (dbName: string) => {
          try {
            await conn.execute(`ATTACH 'md:${dbName}'`);
            console.log(`[MotherDuck] Attached ${dbName} for catalog access`);
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
          console.log('[MotherDuck] Could not attach any database for catalog access');
          throw new Error(
            'Unable to list MotherDuck databases. Please ensure you have at least one database in your MotherDuck account.',
          );
        }

        console.log('[MotherDuck] Querying databases from md_information_schema');
        let result;
        try {
          result = await conn.execute(
            'SELECT name FROM md_information_schema.databases ORDER BY name',
          );
          console.log('[MotherDuck] Query result:', result);
        } catch (queryError) {
          console.error('[MotherDuck] Failed to query databases:', queryError);
          throw new Error(`Failed to list MotherDuck databases: ${queryError}`);
        }

        const options = result.rows.map((r: any) => r.name as string).filter(Boolean);
        console.log('[MotherDuck] Found databases:', options);
        setDbs(options);

        // Detach the catalog database if it was only for listing
        if (
          catalogDbName &&
          !getConnectedDbNamesForInstance(selectedSecretId || undefined, selectedSecretName).has(
            catalogDbName,
          )
        ) {
          try {
            const { toDuckDBIdentifier } = await import('@utils/duckdb/identifier');
            await conn.execute(`DETACH DATABASE ${toDuckDBIdentifier(catalogDbName)}`);
            console.log(`[MotherDuck] Detached catalog database ${catalogDbName}`);
          } catch (e) {
            console.log(`[MotherDuck] Could not detach catalog database ${catalogDbName}:`, e);
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
    console.log('[MotherDuck] handleAttach called');
    console.log('[MotherDuck] Selected databases:', Array.from(selectedSet));
    console.log('[MotherDuck] Selected secret ID:', selectedSecretId);
    console.log('[MotherDuck] Selected secret name:', selectedSecretName);

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
      console.log('[MotherDuck] Applying secret to set environment variable');
      await SecretsAPI.applySecretToConnection({
        connection_id: `motherduck_attach_${Date.now()}`, // Use unique ID to force fresh application
        secret_id: selectedSecretId,
      });
      console.log('[MotherDuck] Environment variable set');

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

        // Attach each database individually
        for (const dbName of namesToAttach) {
          // Skip if already attached
          if (currentlyAttached.has(dbName)) {
            console.log(`[MotherDuck] Database ${dbName} is already attached`);
            attachedNames.push(dbName);
            attachedDbNames.add(dbName);
            continue;
          }

          const dbUrl = `md:${dbName}`;

          try {
            const attachQuery = `ATTACH '${dbUrl}'`;
            console.log(`[MotherDuck] Attaching database ${dbName}`);
            await conn.execute(attachQuery);
            console.log(`[MotherDuck] Successfully attached ${dbName}`);

            // Verify we can see tables in this database
            try {
              const { toDuckDBIdentifier } = await import('@utils/duckdb/identifier');
              const verifyQuery = `SELECT COUNT(*) as table_count FROM ${toDuckDBIdentifier(dbName)}.information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')`;
              const verifyResult = await conn.execute(verifyQuery);
              const tableCount = verifyResult.rows[0]?.table_count || 0;
              console.log(`[MotherDuck] Database ${dbName} has ${tableCount} tables`);

              attachedNames.push(dbName);
              attachedDbNames.add(dbName);
            } catch (verifyError) {
              console.warn(`[MotherDuck] Could not verify tables in ${dbName}:`, verifyError);
              // Still add it as attached
              attachedNames.push(dbName);
              attachedDbNames.add(dbName);
            }
          } catch (e: any) {
            const msg = String(e?.message || e);
            if (/already attached|already in use/i.test(msg)) {
              console.log(`[MotherDuck] Database ${dbName} already attached`);
              attachedNames.push(dbName);
              attachedDbNames.add(dbName);
            } else {
              console.error(`[MotherDuck] Failed to attach ${dbName}:`, e);
            }
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
          url: `md:${dbName}`,
          dbName,
          dbType: 'duckdb',
          connectionState: 'connected',
          attachedAt: Date.now(),
          instanceName: selectedSecretName,
          instanceId: selectedSecretId, // Use stable secret ID for grouping
        };
        newDataSources.set(rdb.id, rdb);
        created.push(rdb);
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
      console.error('Failed to attach MotherDuck database:', error);
      let msg: string;
      if (error instanceof Error) {
        msg = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        msg = String((error as any).message);
      } else {
        msg = String(error);
      }
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
