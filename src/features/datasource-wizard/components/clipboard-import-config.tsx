import { showError, showSuccess } from '@components/app-notifications';
import { ConnectionPool } from '@engines/types';
import { refreshDatabaseMetadata } from '@features/data-explorer/utils/metadata-refresh';
import { Button, Group, Stack, Text, TextInput, Textarea, Checkbox } from '@mantine/core';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

import { importClipboardAsTable } from '../utils/clipboard-import';

interface ClipboardImportConfigProps {
  content: string;
  format: 'csv' | 'json';
  pool: ConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function ClipboardImportConfig({
  content,
  format,
  pool,
  onBack,
  onClose,
}: ClipboardImportConfigProps) {
  const [tableName, setTableName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasHeaders, setHasHeaders] = useState(true);

  const handleConfirm = async () => {
    if (!tableName.trim() || !pool) return;

    setIsLoading(true);
    try {
      // Create table directly in DuckDB
      await importClipboardAsTable(pool, content, tableName.trim(), format, hasHeaders);

      // Refresh metadata to show new table in Explorer
      await refreshDatabaseMetadata(pool, [PERSISTENT_DB_NAME]);

      // Close modal and show success
      onClose();
      showSuccess({
        title: 'Table created',
        message: `Table '${tableName.trim()}' has been created successfully`,
      });
    } catch (error) {
      console.error('Import error:', error);
      showError({
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show preview of clipboard content
  const previewContent = content.length > 200 ? `${content.substring(0, 200)}...` : content;

  // Count CSV rows for conditional display
  const rowCount =
    format === 'csv'
      ? content
          .trim()
          .split('\n')
          .filter((line) => line.trim() !== '').length
      : 0;

  // Validate table name
  const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
  const isValidName = sanitizedTableName.length > 0 && sanitizedTableName.length <= 50;

  return (
    <Stack gap={16} w={520}>
      <Stack gap={12}>
        <Textarea
          label="Preview"
          data-testid={setDataTestId('clipboard-preview')}
          value={previewContent}
          readOnly
          autosize
          minRows={4}
          maxRows={8}
        />
      </Stack>

      <Stack gap={8}>
        <TextInput
          placeholder={`my_${format}_table`}
          value={tableName}
          label="Table name"
          data-testid={setDataTestId('clipboard-dataset-name')}
          onChange={(e) => setTableName(e.target.value)}
          error={
            tableName && !isValidName
              ? 'Name must be 1-50 characters, letters/numbers only'
              : undefined
          }
          autoFocus
        />
        {sanitizedTableName !== tableName && tableName && (
          <Text size="xs" c="text-secondary">
            Will be created as: {sanitizedTableName}
          </Text>
        )}
      </Stack>

      {format === 'csv' && rowCount > 1 && (
        <Checkbox
          label="First row contains headers"
          data-testid={setDataTestId('clipboard-has-headers')}
          checked={hasHeaders}
          onChange={(e) => setHasHeaders(e.currentTarget.checked)}
          color="background-accent"
        />
      )}

      <Group justify="flex-end" gap={12}>
        <Button variant="transparent" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!isValidName || isLoading}
          loading={isLoading}
          data-testid={setDataTestId('clipboard-import-button')}
        >
          Create Table
        </Button>
      </Group>
    </Stack>
  );
}
