import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import {
  ActionIcon,
  Badge,
  Box,
  Divider,
  Group,
  Indicator,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { SQLScriptId } from '@models/sql-script';
import { setScriptSession, useAppStore } from '@store/app-store';
import { IconChevronRight, IconDatabase, IconSearch } from '@tabler/icons-react';
import { getDatabaseIdentifier, isDatabaseDataSource } from '@utils/data-source';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useMemo, useState } from 'react';

interface ScriptSessionSelectorProps {
  scriptId: SQLScriptId;
}

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

export const ScriptSessionSelector = ({ scriptId }: ScriptSessionSelectorProps) => {
  const pool = useDuckDBConnectionPool();
  const dataSources = useAppStore((state) => state.dataSources);
  const databaseMetadata = useAppStore((state) => state.databaseMetadata);
  const session = useAppStore((state) => state.sqlScriptSessions.get(scriptId));
  const [opened, { close, toggle }] = useDisclosure(false);
  const [schemaCache, setSchemaCache] = useState<Map<string, string[]>>(new Map());
  const [loadingCatalog, setLoadingCatalog] = useState<string | null>(null);
  const [catalogFilter, setCatalogFilter] = useState('');
  const [previewCatalog, setPreviewCatalog] = useState<string | null>(null);

  const catalogs = useMemo(() => {
    const set = new Set<string>([PERSISTENT_DB_NAME, 'memory']);
    for (const dbName of databaseMetadata.keys()) set.add(dbName);
    for (const dataSource of dataSources.values()) {
      if (isDatabaseDataSource(dataSource)) {
        set.add(getDatabaseIdentifier(dataSource));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dataSources, databaseMetadata]);

  const currentCatalog = session?.currentCatalog ?? PERSISTENT_DB_NAME;
  const currentSchema = session?.currentSchema ?? null;
  const focusedCatalog = previewCatalog ?? currentCatalog;

  // Lazy-load schemas for whichever catalog is currently focused in the popover.
  useEffect(() => {
    if (!opened || !pool || !focusedCatalog || schemaCache.has(focusedCatalog)) return;

    let cancelled = false;
    setLoadingCatalog(focusedCatalog);
    (async () => {
      const conn = await pool.getBackgroundConnection();
      try {
        const result = await conn.query(
          `SELECT schema_name FROM duckdb_schemas() WHERE database_name = '${escapeSqlLiteral(focusedCatalog)}' ORDER BY schema_name`,
        );
        if (cancelled) return;
        const schemas = result.toArray().map((row: any) => String(row.schema_name));
        setSchemaCache((prev) => {
          const next = new Map(prev);
          next.set(focusedCatalog, schemas);
          return next;
        });
      } catch (error) {
        console.warn('Failed to load DuckDB schemas for script session selector:', error);
        setSchemaCache((prev) => {
          const next = new Map(prev);
          next.set(focusedCatalog, []);
          return next;
        });
      } finally {
        if (!cancelled) setLoadingCatalog(null);
        await conn.close();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opened, pool, focusedCatalog, schemaCache]);

  const filteredCatalogs = useMemo(() => {
    const needle = catalogFilter.trim().toLowerCase();
    if (!needle) return catalogs;
    return catalogs.filter((c) => c.toLowerCase().includes(needle));
  }, [catalogs, catalogFilter]);

  const focusedSchemas = schemaCache.get(focusedCatalog) ?? [];
  const isLoadingFocusedSchemas =
    loadingCatalog === focusedCatalog && !schemaCache.has(focusedCatalog);

  const commitCatalogOnly = (catalog: string) => {
    setScriptSession(scriptId, {
      scriptId,
      currentCatalog: catalog,
      currentSchema: null,
      isTransient: session?.isTransient ?? false,
    });
    close();
  };

  const commitCatalogAndSchema = (catalog: string, schema: string) => {
    setScriptSession(scriptId, {
      scriptId,
      currentCatalog: catalog,
      currentSchema: schema,
      isTransient: session?.isTransient ?? false,
    });
    close();
  };

  const triggerSummary = currentSchema ? `${currentCatalog} · ${currentSchema}` : currentCatalog;

  return (
    <Popover
      opened={opened}
      onClose={close}
      position="bottom-end"
      offset={6}
      shadow="md"
      radius="md"
      withinPortal
      closeOnEscape
      closeOnClickOutside
    >
      <Popover.Target>
        <Indicator
          disabled={!session?.isTransient}
          color="yellow"
          size={8}
          offset={4}
          position="top-end"
          withBorder
        >
          <Tooltip
            openDelay={250}
            disabled={opened}
            withinPortal
            label={
              <Stack gap={4} miw={160}>
                <Text size="xs" fw={700} tt="uppercase" c="gray.5" style={{ letterSpacing: 0.5 }}>
                  Script session
                </Text>
                <Group gap={6} wrap="nowrap" align="baseline">
                  <Text size="xs" c="gray.5" style={{ flexShrink: 0 }}>
                    Catalog
                  </Text>
                  <Text size="xs" fw={600} c="white">
                    {currentCatalog}
                  </Text>
                </Group>
                <Group gap={6} wrap="nowrap" align="baseline">
                  <Text size="xs" c="gray.5" style={{ flexShrink: 0 }}>
                    Schema
                  </Text>
                  <Text
                    size="xs"
                    fw={currentSchema ? 600 : 400}
                    c={currentSchema ? 'white' : 'gray.5'}
                    fs={currentSchema ? undefined : 'italic'}
                  >
                    {currentSchema ?? 'default'}
                  </Text>
                </Group>
                {session?.isTransient && (
                  <Text size="xs" c="yellow.4">
                    Transient — temp tables and SET values were not preserved
                  </Text>
                )}
              </Stack>
            }
          >
            <ActionIcon
              variant="subtle"
              c="background-accent"
              aria-label={`Script session: ${triggerSummary}`}
              data-testid={setDataTestId('script-session-selector-trigger')}
              onClick={toggle}
            >
              <IconDatabase size={18} />
            </ActionIcon>
          </Tooltip>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p={0} w={360}>
        <Stack gap={0}>
          <Box px="sm" pt="sm" pb={6}>
            <Group justify="space-between" align="center" wrap="nowrap" gap={6}>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: 0.6 }}>
                Script session
              </Text>
              {session?.isTransient && (
                <Tooltip
                  label="Connection was evicted. Catalog/schema will be restored; temp tables and SET values are gone."
                  multiline
                  w={260}
                >
                  <Badge size="xs" color="yellow" variant="light" radius="sm">
                    Transient
                  </Badge>
                </Tooltip>
              )}
            </Group>
            <Group gap={6} align="baseline" mt={4} wrap="nowrap">
              <IconDatabase size={14} style={{ flexShrink: 0, opacity: 0.65 }} />
              <Text size="sm" fw={600} truncate aria-label="Script session current catalog">
                {currentCatalog}
              </Text>
              <Text size="sm" c="dimmed">
                /
              </Text>
              <Text
                size="sm"
                fw={currentSchema ? 600 : 400}
                c={currentSchema ? undefined : 'dimmed'}
                truncate
                aria-label="Script session current schema"
              >
                {currentSchema ?? 'no schema'}
              </Text>
            </Group>
          </Box>

          <Box px="sm" pb="xs">
            <TextInput
              size="xs"
              placeholder="Filter catalogs"
              leftSection={<IconSearch size={14} stroke={1.6} />}
              leftSectionWidth={28}
              leftSectionPointerEvents="none"
              value={catalogFilter}
              onChange={(event) => setCatalogFilter(event.currentTarget.value)}
              aria-label="Filter catalogs"
              autoFocus
            />
          </Box>

          <Divider />

          <Group gap={0} align="stretch" wrap="nowrap" style={{ minHeight: 200 }}>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text
                size="10px"
                tt="uppercase"
                fw={700}
                c="dimmed"
                px="sm"
                pt={8}
                pb={4}
                style={{ letterSpacing: 0.6 }}
              >
                Catalog
              </Text>
              <ScrollArea h={220} type="hover" scrollbarSize={6}>
                <Stack gap={1} px={6} pb={6}>
                  {filteredCatalogs.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" py="xs">
                      No catalogs match
                    </Text>
                  ) : (
                    filteredCatalogs.map((cat) => {
                      const isCurrent = cat === currentCatalog;
                      const isFocused = cat === focusedCatalog;
                      return (
                        <UnstyledButton
                          key={cat}
                          onMouseEnter={() => setPreviewCatalog(cat)}
                          onFocus={() => setPreviewCatalog(cat)}
                          onClick={() => commitCatalogOnly(cat)}
                          data-testid={setDataTestId(`script-session-catalog-${cat}`)}
                          aria-label={`Select catalog ${cat}`}
                          aria-pressed={isCurrent}
                          px={8}
                          py={6}
                          style={{
                            borderRadius: 6,
                            background: isFocused
                              ? 'var(--mantine-color-default-hover)'
                              : 'transparent',
                            outline: isCurrent
                              ? '1px solid var(--mantine-color-blue-filled)'
                              : 'none',
                            outlineOffset: -1,
                          }}
                        >
                          <Group gap={6} wrap="nowrap" justify="space-between">
                            <Text
                              size="xs"
                              fw={isCurrent ? 600 : 400}
                              truncate
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {cat}
                            </Text>
                            <IconChevronRight
                              size={12}
                              style={{ opacity: isFocused ? 0.7 : 0.3, flexShrink: 0 }}
                            />
                          </Group>
                        </UnstyledButton>
                      );
                    })
                  )}
                </Stack>
              </ScrollArea>
            </Box>

            <Divider orientation="vertical" />

            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text
                size="10px"
                tt="uppercase"
                fw={700}
                c="dimmed"
                px="sm"
                pt={8}
                pb={4}
                style={{ letterSpacing: 0.6 }}
              >
                Schema in {focusedCatalog}
              </Text>
              <ScrollArea h={220} type="hover" scrollbarSize={6}>
                <Stack gap={1} px={6} pb={6}>
                  {isLoadingFocusedSchemas ? (
                    <Group justify="center" py="md">
                      <Loader size="xs" />
                    </Group>
                  ) : focusedSchemas.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" py="xs">
                      No schemas
                    </Text>
                  ) : (
                    focusedSchemas.map((sch) => {
                      const isCurrent = focusedCatalog === currentCatalog && sch === currentSchema;
                      return (
                        <UnstyledButton
                          key={sch}
                          onClick={() => commitCatalogAndSchema(focusedCatalog, sch)}
                          data-testid={setDataTestId(`script-session-schema-${sch}`)}
                          aria-label={`Select schema ${sch} in ${focusedCatalog}`}
                          aria-pressed={isCurrent}
                          px={8}
                          py={6}
                          style={{
                            borderRadius: 6,
                            background: isCurrent
                              ? 'var(--mantine-color-blue-light)'
                              : 'transparent',
                          }}
                        >
                          <Text
                            size="xs"
                            fw={isCurrent ? 600 : 400}
                            c={isCurrent ? 'background-accent' : undefined}
                            truncate
                          >
                            {sch}
                          </Text>
                        </UnstyledButton>
                      );
                    })
                  )}
                </Stack>
              </ScrollArea>
            </Box>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
