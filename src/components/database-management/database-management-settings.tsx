import { useDuckDBPersistence } from '@features/duckdb-persistence-context';
import { Button, Group, Text, Stack, Badge, Card, rem, Progress, FileButton } from '@mantine/core';
import { IconDatabase, IconDownload, IconTrash, IconUpload } from '@tabler/icons-react';
import { formatFileSize, getPersistenceStateText } from '@utils/duckdb-persistence';
import React, { useCallback, useRef, useState } from 'react';

export const DatabaseManagementSettings = () => {
  const {
    persistenceState,
    isPersistenceSupported,
    exportDatabase,
    clearDatabase,
    importDatabase,
  } = useDuckDBPersistence();

  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const resetRef = useRef<() => void>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportDatabase();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [exportDatabase]);

  const handleClear = useCallback(async () => {
    setIsClearing(true);
    try {
      await clearDatabase();
    } catch (error) {
      console.error('Clear failed:', error);
    } finally {
      setIsClearing(false);
    }
  }, [clearDatabase]);

  const handleImport = useCallback(
    async (file: File | null) => {
      if (!file) return;

      setIsImporting(true);
      setImportError(null);

      try {
        if (!file.name.endsWith('.db')) {
          setImportError('Invalid file type. Please select a .db file.');
          return;
        }

        const success = await importDatabase(file);

        if (!success) {
          setImportError('Failed to import database');
        }
      } catch (error) {
        console.error('Import failed:', error);
        setImportError('An error occurred during import');
      } finally {
        setIsImporting(false);
        resetRef.current?.();
      }
    },
    [importDatabase],
  );

  if (!isPersistenceSupported) {
    return (
      <Card withBorder p="md">
        <Stack>
          <Group>
            <IconDatabase size={24} />
            <Text size="xl" fw={500}>
              Database Storage
            </Text>
          </Group>
          <Text c="dimmed">
            Your browser does not support persistent storage. DuckDB is running in memory mode.
          </Text>
        </Stack>
      </Card>
    );
  }

  const storageMode = 'persistent';
  const storageText = getPersistenceStateText(persistenceState);
  const dbSize = formatFileSize(persistenceState.dbSize);

  // Calculate a very rough size indicator (max 1GB)
  const sizePercentage = Math.min((persistenceState.dbSize / (1024 * 1024 * 1024)) * 100, 100);

  return (
    <Card withBorder p="md">
      <Stack>
        <Group>
          <IconDatabase size={24} />
          <Text size="xl" fw={500}>
            Database Storage
          </Text>
          <Badge color="green" variant="light">
            {storageMode}
          </Badge>
        </Group>

        <Text c="dimmed">{storageText}</Text>

        <Stack>
          <Text size="sm">Database Size: {dbSize}</Text>
          <Progress value={sizePercentage} size="sm" />
        </Stack>

        <Group mt={rem(10)}>
          <Button
            onClick={handleExport}
            loading={isExporting}
            disabled={isClearing || isImporting || persistenceState.dbSize === 0}
            leftSection={<IconDownload size={16} />}
          >
            Export Database
          </Button>

          <FileButton resetRef={resetRef} accept=".db" onChange={handleImport}>
            {(props) => (
              <Button
                {...props}
                leftSection={<IconUpload size={16} />}
                loading={isImporting}
                disabled={isExporting || isClearing}
              >
                Import Database
              </Button>
            )}
          </FileButton>

          <Button
            leftSection={<IconTrash size={16} />}
            color="red"
            variant="light"
            onClick={handleClear}
            loading={isClearing}
            disabled={isExporting || isImporting || persistenceState.dbSize === 0}
          >
            Clear Database
          </Button>
        </Group>

        {importError && (
          <Text color="red" size="sm" mt={rem(5)}>
            {importError}
          </Text>
        )}
      </Stack>
    </Card>
  );
};
