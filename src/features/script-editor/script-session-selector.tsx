import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Badge, Group, Select, Tooltip } from '@mantine/core';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { SQLScriptId } from '@models/sql-script';
import { setScriptSession, useAppStore } from '@store/app-store';
import { getDatabaseIdentifier, isDatabaseDataSource } from '@utils/data-source';
import { useEffect, useMemo, useState } from 'react';

interface ScriptSessionSelectorProps {
  scriptId: SQLScriptId;
}

export const ScriptSessionSelector = ({ scriptId }: ScriptSessionSelectorProps) => {
  const pool = useDuckDBConnectionPool();
  const dataSources = useAppStore((state) => state.dataSources);
  const databaseMetadata = useAppStore((state) => state.databaseMetadata);
  const session = useAppStore((state) => state.sqlScriptSessions.get(scriptId));
  const [schemaCache, setSchemaCache] = useState<Map<string, string[]>>(new Map());

  const catalogOptions = useMemo(() => {
    const catalogs = new Set<string>([PERSISTENT_DB_NAME, 'memory']);

    for (const dbName of databaseMetadata.keys()) {
      catalogs.add(dbName);
    }

    for (const dataSource of dataSources.values()) {
      if (isDatabaseDataSource(dataSource)) {
        catalogs.add(getDatabaseIdentifier(dataSource));
      }
    }

    return Array.from(catalogs)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [dataSources, databaseMetadata]);

  const selectedCatalog = session?.currentCatalog ?? PERSISTENT_DB_NAME;
  const selectedSchema = session?.currentSchema ?? null;

  useEffect(() => {
    if (!pool || !selectedCatalog || schemaCache.has(selectedCatalog)) return;

    let cancelled = false;
    (async () => {
      const conn = await pool.getBackgroundConnection();
      try {
        const result = await conn.query(
          `SELECT schema_name FROM duckdb_schemas() WHERE catalog_name = '${selectedCatalog.replace(/'/g, "''")}' ORDER BY schema_name`,
        );
        if (cancelled) return;
        setSchemaCache((previous) => {
          const next = new Map(previous);
          next.set(
            selectedCatalog,
            result.toArray().map((row: any) => String(row.schema_name)),
          );
          return next;
        });
      } catch (error) {
        console.warn('Failed to load DuckDB schemas for script session selector:', error);
      } finally {
        await conn.close();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pool, schemaCache, selectedCatalog]);

  const schemaOptions =
    (selectedCatalog ? schemaCache.get(selectedCatalog) : undefined) ?? ['main', 'information_schema'];

  const updateSession = (currentCatalog: string | null, currentSchema: string | null) => {
    setScriptSession(scriptId, {
      scriptId,
      currentCatalog,
      currentSchema,
      isTransient: session?.isTransient ?? false,
    });
  };

  return (
    <Group gap={6} wrap="nowrap">
      <Select
        aria-label="Session catalog"
        size="xs"
        w={150}
        placeholder="Catalog"
        searchable
        clearable
        data={catalogOptions}
        value={selectedCatalog}
        onChange={(value) => updateSession(value, null)}
      />
      <Select
        aria-label="Session schema"
        size="xs"
        w={150}
        placeholder="Schema"
        searchable
        clearable
        disabled={!selectedCatalog}
        data={schemaOptions.map((value) => ({ value, label: value }))}
        value={selectedSchema}
        onChange={(value) => updateSession(selectedCatalog, value)}
      />
      {session?.isTransient && (
        <Tooltip label="This tab's connection was evicted. Catalog/schema will be restored on next run; temp tables and SET values were not preserved.">
          <Badge size="xs" color="yellow" variant="light">
            Transient session
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
};
