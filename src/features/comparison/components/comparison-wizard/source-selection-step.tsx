import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Select, Stack, Text, SegmentedControl, Textarea, Paper } from '@mantine/core';
import { ComparisonSource } from '@models/tab';
import { useEffect, useState } from 'react';

import { useAvailableTables } from '../../hooks/use-available-tables';

interface SourceSelectionStepProps {
  onSourceAChange: (source: ComparisonSource | null) => void;
  onSourceBChange: (source: ComparisonSource | null) => void;
}

export const SourceSelectionStep = ({
  onSourceAChange,
  onSourceBChange,
}: SourceSelectionStepProps) => {
  const pool = useInitializedDuckDBConnectionPool();
  const { tables, isLoading } = useAvailableTables(pool);

  const [sourceAType, setSourceAType] = useState<'table' | 'query'>('table');
  const [sourceBType, setSourceBType] = useState<'table' | 'query'>('table');

  const [selectedTableA, setSelectedTableA] = useState<string | null>(null);
  const [selectedTableB, setSelectedTableB] = useState<string | null>(null);

  const [queryA, setQueryA] = useState<string>('');
  const [queryB, setQueryB] = useState<string>('');
  const [queryAliasA, _setQueryAliasA] = useState<string>('source_a');
  const [queryAliasB, _setQueryAliasB] = useState<string>('source_b');

  // Build source from current state
  useEffect(() => {
    if (sourceAType === 'table' && selectedTableA) {
      const parts = selectedTableA.split('.');
      // Full name format: database.schema.table
      const tableName = parts[parts.length - 1];
      const schemaName = parts.length > 1 ? parts[parts.length - 2] : 'main';
      const databaseName = parts.length > 2 ? parts[parts.length - 3] : undefined;

      onSourceAChange({
        type: 'table',
        tableName,
        schemaName,
        databaseName,
      });
    } else if (sourceAType === 'query' && queryA.trim()) {
      onSourceAChange({
        type: 'query',
        sql: queryA,
        alias: queryAliasA,
      });
    } else {
      onSourceAChange(null);
    }
  }, [sourceAType, selectedTableA, queryA, queryAliasA, onSourceAChange]);

  useEffect(() => {
    if (sourceBType === 'table' && selectedTableB) {
      const parts = selectedTableB.split('.');
      // Full name format: database.schema.table
      const tableName = parts[parts.length - 1];
      const schemaName = parts.length > 1 ? parts[parts.length - 2] : 'main';
      const databaseName = parts.length > 2 ? parts[parts.length - 3] : undefined;

      onSourceBChange({
        type: 'table',
        tableName,
        schemaName,
        databaseName,
      });
    } else if (sourceBType === 'query' && queryB.trim()) {
      onSourceBChange({
        type: 'query',
        sql: queryB,
        alias: queryAliasB,
      });
    } else {
      onSourceBChange(null);
    }
  }, [sourceBType, selectedTableB, queryB, queryAliasB, onSourceBChange]);

  const tableOptions = tables.map((table) => ({
    value: table.fullName,
    label: table.fullName,
  }));

  return (
    <Stack gap="xl">
      <div>
        <Text size="lg" fw={600} mb="md">
          Select Data Sources
        </Text>
        <Text size="sm" c="dimmed">
          Choose two tables or write custom SQL queries to compare
        </Text>
      </div>

      {/* Source A */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Text size="sm" fw={600}>
            Source A
          </Text>

          <SegmentedControl
            value={sourceAType}
            onChange={(value) => setSourceAType(value as 'table' | 'query')}
            data={[
              { label: 'Table', value: 'table' },
              { label: 'Custom Query', value: 'query' },
            ]}
          />

          {sourceAType === 'table' ? (
            <Select
              label="Select Table"
              placeholder={isLoading ? 'Loading tables...' : 'Choose a table'}
              data={tableOptions}
              value={selectedTableA}
              onChange={setSelectedTableA}
              searchable
              disabled={isLoading}
            />
          ) : (
            <Stack gap="xs">
              <Textarea
                label="SQL Query"
                placeholder="SELECT * FROM my_table WHERE ..."
                value={queryA}
                onChange={(e) => setQueryA(e.currentTarget.value)}
                minRows={4}
                autosize
              />
              <Text size="xs" c="dimmed">
                Alias: {queryAliasA}
              </Text>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Source B */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Text size="sm" fw={600}>
            Source B
          </Text>

          <SegmentedControl
            value={sourceBType}
            onChange={(value) => setSourceBType(value as 'table' | 'query')}
            data={[
              { label: 'Table', value: 'table' },
              { label: 'Custom Query', value: 'query' },
            ]}
          />

          {sourceBType === 'table' ? (
            <Select
              label="Select Table"
              placeholder={isLoading ? 'Loading tables...' : 'Choose a table'}
              data={tableOptions}
              value={selectedTableB}
              onChange={setSelectedTableB}
              searchable
              disabled={isLoading}
            />
          ) : (
            <Stack gap="xs">
              <Textarea
                label="SQL Query"
                placeholder="SELECT * FROM my_table WHERE ..."
                value={queryB}
                onChange={(e) => setQueryB(e.currentTarget.value)}
                minRows={4}
                autosize
              />
              <Text size="xs" c="dimmed">
                Alias: {queryAliasB}
              </Text>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
};
