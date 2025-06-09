import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { SqlEditor } from '@features/editor/sql-editor';
import { ActionIcon, Code, Group, Tooltip, Badge, Box, useMantineColorScheme, LoadingOverlay, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { ChatMessageQuery } from '@models/ai-chat';
import { IconCopy, IconExternalLink, IconPlayerPlay, IconPencil, IconCheck, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { ChatResultTable } from './chat-result-table';

interface SqlQueryDisplayProps {
  query: ChatMessageQuery;
  onRunQuery?: (sql: string) => Promise<void>;
  isRerunning?: boolean;
}

export const SqlQueryDisplay = ({
  query,
  onRunQuery,
  isRerunning = false,
}: SqlQueryDisplayProps) => {
  const clipboard = useClipboard();
  const { colorScheme } = useMantineColorScheme();
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const [editedSql, setEditedSql] = useState(query.sql);

  const handleCopyQuery = () => {
    clipboard.copy(query.sql);
    showNotification({
      message: 'Query copied to clipboard',
      color: 'green',
    });
  };

  const handleOpenInScript = () => {
    const script = createSQLScript(
      `Query from AI Chat - ${new Date().toLocaleString()}`,
      query.sql,
    );
    getOrCreateTabFromScript(script, true);
    showNotification({
      message: 'Query opened in new script tab',
      color: 'green',
    });
  };

  const handleRunQuery = async () => {
    if (onRunQuery) {
      const sqlToRun = isEditingQuery ? editedSql : query.sql;
      await onRunQuery(sqlToRun);
      setIsEditingQuery(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedSql(query.sql);
    setIsEditingQuery(false);
  };

  return (
    <div className="space-y-2">
      <Box className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 relative">
        <LoadingOverlay
          visible={isRerunning}
          overlayProps={{ radius: 'sm', blur: 1 }}
          loaderProps={{ size: 'xs' }}
        />
        <Group justify="space-between" className="mb-2">
          <Group gap="xs">
            <Badge size="sm" variant="dot" color="blue">
              SQL Query
            </Badge>
            {query.executionTime && (
              <Text size="xs" c="dimmed">
                {query.executionTime}ms
              </Text>
            )}
          </Group>
          <Group gap={4} className="action-button-group">
            {isEditingQuery ? (
              <>
                <Tooltip label="Save changes">
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    color="green"
                    onClick={handleRunQuery}
                    data-testid="ai-chat-save-edit"
                  >
                    <IconCheck size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Cancel">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={handleCancelEdit}
                    data-testid="ai-chat-cancel-edit"
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip label="Edit query">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={() => setIsEditingQuery(true)}
                    data-testid="ai-chat-edit-query"
                    className="hover:bg-gray-200 dark:hover:bg-gray-700 chat-action-button"
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Re-run query">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={handleRunQuery}
                    data-testid="ai-chat-rerun-query"
                    className="hover:bg-gray-200 dark:hover:bg-gray-700 chat-action-button"
                    disabled={isRerunning}
                  >
                    <IconPlayerPlay size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Copy query">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={handleCopyQuery}
                    data-testid="ai-chat-copy-query"
                    className="hover:bg-gray-200 dark:hover:bg-gray-700 chat-action-button"
                  >
                    <IconCopy size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Open in new script tab">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={handleOpenInScript}
                    data-testid="ai-chat-open-script"
                    className="hover:bg-gray-200 dark:hover:bg-gray-700 chat-action-button"
                  >
                    <IconExternalLink size={14} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </Group>

        {isEditingQuery ? (
          <div className="rounded-md overflow-hidden border border-gray-300 dark:border-gray-600 edit-mode-enter sql-editor-transition">
            <div style={{ height: '150px', overflow: 'auto' }}>
              <SqlEditor
                value={editedSql}
                onChange={setEditedSql}
                colorSchemeDark={colorScheme === 'dark'}
                onBlur={() => {}}
                functionTooltips={{}}
              />
            </div>
          </div>
        ) : (
          <Code block className="language-sql text-xs bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700">
            {query.sql}
          </Code>
        )}
      </Box>

      {/* Query results or error */}
      {query.error ? (
        <Box className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-3">
          <Group gap="xs">
            <Badge size="sm" color="red" variant="dot">
              Error
            </Badge>
            <Text size="sm" c="red" className="flex-1">
              {query.error}
            </Text>
          </Group>
        </Box>
      ) : query.results ? (
        <Box className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden result-table-container relative">
          <LoadingOverlay
            visible={isRerunning}
            overlayProps={{ radius: 'sm', blur: 2 }}
            loaderProps={{ size: 'sm' }}
          />
          <Box className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <Group justify="space-between">
              <Group gap="xs">
                <Badge size="sm" variant="dot" color="green" className="result-badge">
                  Results
                </Badge>
                <Text size="xs" c="dimmed">
                  {query.results.rows.length} rows
                </Text>
              </Group>
            </Group>
          </Box>
          <ChatResultTable results={query.results} />
        </Box>
      ) : null}
    </div>
  );
};

