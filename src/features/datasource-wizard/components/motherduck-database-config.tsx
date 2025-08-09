import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { Alert, Button, Group, Loader, Stack, Text, Checkbox, ScrollArea } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { RemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { makePersistentDataSourceId } from '@utils/data-source';
import { quote } from '@utils/helpers';
import { MOTHERDUCK_CONSTANTS } from '@utils/motherduck-helper';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useMemo, useState } from 'react';

interface MotherDuckDatabaseConfigProps {
  pool: ConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function MotherDuckDatabaseConfig({ pool, onBack, onClose }: MotherDuckDatabaseConfigProps) {
  const [dbs, setDbs] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);
  const [_selectedDb, setSelectedDb] = useInputState('');
  const [readOnly, setReadOnly] = useState(true);
  const connectedDbNames = useMemo(() => {
    const { dataSources } = useAppStore.getState();
    const names = new Set<string>();
    for (const ds of dataSources.values()) {
      if (ds.type === 'remote-db') names.add((ds as RemoteDB).dbName);
    }
    return names;
  }, []);

  const isAttachDisabled = useMemo(
    () => selectedSet.size === 0 || attachLoading || loading,
    [selectedSet, attachLoading, loading],
  );

  const loadMotherDuckList = async () => {
    if (!pool) {
      showError({ title: 'App not ready', message: 'Please wait for the app to initialize' });
      return;
    }
    setLoading(true);
    try {
      // Use a single connection for all steps to avoid per-connection ATTACH issues
      const conn = await pool.acquire();
      try {
        // Ensure extension is available on this connection
        try {
          await conn.execute('INSTALL motherduck');
        } catch (e) {
          console.warn('[MotherDuck] Failed to install motherduck extension:', e);
        }
        try {
          await conn.execute('LOAD motherduck');
        } catch (e) {
          console.warn('[MotherDuck] Failed to load motherduck extension:', e);
          // Continue anyway; subsequent statements will error with a clearer message if needed
        }

        // Attach default context first to populate md_information_schema
        try {
          await conn.execute("ATTACH 'md:'");
        } catch (e) {
          console.warn(
            '[MotherDuck] Failed to attach default context, likely already attached:',
            e,
          );
          // Ignore duplicates / already attached errors
        }

        const result = await conn.execute(
          'SELECT name FROM md_information_schema.databases ORDER BY name',
        );
        const options = result.rows.map((r: any) => r.name as string).filter(Boolean);
        setDbs(options);
        // Preselect those not already connected
        const initial = new Set<string>();
        for (const name of options) if (!connectedDbNames.has(name)) initial.add(name);
        setSelectedSet(initial);
        if (options.length > 0) setSelectedDb(options[0]);
      } finally {
        await pool.release(conn);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
      showError({ title: 'Failed to list MotherDuck databases', message: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load on first mount
    loadMotherDuckList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAttach = async () => {
    if (!pool) {
      showError({ title: 'App not ready', message: 'Please wait for the app to initialize' });
      return;
    }
    if (selectedSet.size === 0) return;
    setAttachLoading(true);
    try {
      const namesToAttach = Array.from(selectedSet).filter((n) => !connectedDbNames.has(n));
      if (namesToAttach.length === 0) {
        showSuccess({ title: 'No action', message: 'Selected databases are already connected' });
        return;
      }

      const { dataSources, databaseMetadata } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      const attachedNames: string[] = [];

      // Use single connection for attach + verification
      const conn = await pool.acquire();
      try {
        try {
          await conn.execute('LOAD motherduck');
        } catch (e) {
          console.warn('[MotherDuck] Failed to load extension in handleAttach:', e);
        }
        // Ensure context attached for info schema (ignore if fails)
        try {
          await conn.execute(`ATTACH ${quote('md:', { single: true })}`);
        } catch (e) {
          console.warn('[MotherDuck] Failed to attach default context in handleAttach:', e);
        }
        for (const dbName of namesToAttach) {
          const url = `md:${dbName}`;
          // Skip attach if already present on this connection
          const exists = await conn
            .execute(
              `SELECT database_name FROM duckdb_databases WHERE database_name = ${quote(dbName, { single: true })}`,
            )
            .then((r: any) => !!(r && (r.rowCount || r.rows?.length)))
            .catch(() => false);
          if (!exists) {
            try {
              await conn.execute(`ATTACH ${quote(url, { single: true })}`);
            } catch (e: any) {
              const msg = String(e?.message || e);
              if (
                !/already in use|already attached|Unique file handle conflict|already exists/i.test(
                  msg,
                )
              ) {
                throw e;
              }
            }
          }
          // Verify
          let ok = false;
          for (let i = 0; i < MOTHERDUCK_CONSTANTS.MAX_VERIFICATION_ATTEMPTS; i += 1) {
            const r = await conn.execute(
              `SELECT database_name FROM duckdb_databases WHERE database_name = ${quote(dbName, { single: true })}`,
            );
            if (r && (r.rowCount || r.rows?.length)) {
              ok = true;
              break;
            }
            await new Promise((res) =>
              setTimeout(res, MOTHERDUCK_CONSTANTS.CATALOG_VERIFICATION_DELAY_MS),
            );
          }
          if (!ok) throw new Error(`Attached database '${dbName}' not visible in catalog`);
          attachedNames.push(dbName);
        }
      } finally {
        await pool.release(conn);
      }

      // Update store and load metadata for all
      const created: any[] = [];
      for (const name of attachedNames) {
        const rdb = {
          type: 'remote-db' as const,
          id: makePersistentDataSourceId(),
          url: `md:${name}`,
          dbName: name,
          dbType: 'duckdb' as const,
          connectionState: 'connected' as const,
          attachedAt: Date.now(),
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
        console.error('[MotherDuck] Failed to load database metadata:', e);
        useAppStore.setState(
          { dataSources: newDataSources },
          false,
          'DatasourceWizard/addMotherDuckDatabases',
        );
      }

      const { _iDbConn, _persistenceAdapter } = useAppStore.getState();
      const persistTarget = _persistenceAdapter || _iDbConn;
      if (persistTarget && created.length) await persistPutDataSources(persistTarget, created);

      showSuccess({
        title: 'Databases added',
        message: `Attached ${attachedNames.length} MotherDuck DB(s)`,
      });
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
      showError({ title: 'Failed to attach database', message: msg });
    } finally {
      setAttachLoading(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Sign in to MotherDuck via your environment token, then select a database to attach
      </Text>

      <Alert
        icon={<IconAlertCircle size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        We will list databases from md_information_schema.databases. Make sure MOTHERDUCK_TOKEN is
        set.
      </Alert>

      <Stack gap={12}>
        <Group>
          <Button
            variant="light"
            color="background-accent"
            onClick={loadMotherDuckList}
            loading={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh list'}
          </Button>
          {loading && <Loader size="sm" />}
        </Group>
        <Text size="sm" c="text-secondary" className="pl-4">
          Select databases to attach (already connected ones are disabled)
        </Text>
        <ScrollArea h={200} offsetScrollbars>
          <Stack gap={6} className="pl-4 pr-2">
            {dbs.length === 0 && !loading && <Text size="sm">No databases found</Text>}
            {dbs.map((name) => {
              const disabled = connectedDbNames.has(name);
              const checked = selectedSet.has(name) && !disabled;
              return (
                <Checkbox
                  key={name}
                  label={name}
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(selectedSet);
                    if (e.currentTarget.checked) next.add(name);
                    else next.delete(name);
                    setSelectedSet(next);
                    setSelectedDb(name);
                  }}
                  disabled={disabled}
                />
              );
            })}
          </Stack>
        </ScrollArea>

        <Checkbox
          label="Read-only access (Recommended)"
          checked={readOnly}
          onChange={(e) => setReadOnly(e.currentTarget.checked)}
          className="pl-4"
        />
      </Stack>

      <Group justify="end" className="mt-4">
        <Button variant="transparent" color="text-secondary" onClick={onBack}>
          Cancel
        </Button>
        <Button
          onClick={handleAttach}
          loading={attachLoading}
          disabled={isAttachDisabled}
          color="background-accent"
          data-testid={setDataTestId('attach-motherduck-database-button')}
        >
          Attach Database
        </Button>
      </Group>
    </Stack>
  );
}
