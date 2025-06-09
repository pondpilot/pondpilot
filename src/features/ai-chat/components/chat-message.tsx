import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { SqlEditor } from '@features/editor/sql-editor';
import { Paper, Text, ActionIcon, Group, Code, Tooltip, Box, Badge, useMantineColorScheme } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { ChatMessage as ChatMessageType } from '@models/ai-chat';
import { IconCopy, IconExternalLink, IconPlayerPlay, IconPencil, IconCheck, IconX } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

import { ChatResultTable } from './chat-result-table';

interface ChatMessageProps {
  message: ChatMessageType;
  onRerunQuery?: (messageId: string, sql: string) => void;
}

export const ChatMessage = ({ message, onRerunQuery }: ChatMessageProps) => {
  const clipboard = useClipboard();
  const { colorScheme } = useMantineColorScheme();
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const [editedSql, setEditedSql] = useState(message.query?.sql || '');
  const editorRef = useRef<string>(message.query?.sql || '');

  const handleCopyQuery = () => {
    if (message.query?.sql) {
      clipboard.copy(message.query.sql);
      showNotification({
        message: 'Query copied to clipboard',
        color: 'green',
      });
    }
  };

  const handleOpenInScript = () => {
    if (message.query?.sql) {
      // Create a new script with the query
      const script = createSQLScript(
        `Query from AI Chat - ${new Date().toLocaleString()}`,
        message.query.sql,
      );

      // Create and activate a tab for the script
      getOrCreateTabFromScript(script, true);

      showNotification({
        message: 'Query opened in new script tab',
        color: 'green',
      });
    }
  };

  const isUser = message.role === 'user';

  const handleEditQuery = () => {
    setIsEditingQuery(true);
    setEditedSql(message.query?.sql || '');
  };

  const handleSaveEdit = () => {
    if (onRerunQuery && editedSql.trim()) {
      onRerunQuery(message.id, editedSql);
    }
    setIsEditingQuery(false);
  };

  const handleCancelEdit = () => {
    setEditedSql(message.query?.sql || '');
    setIsEditingQuery(false);
  };

  const handleRerun = () => {
    if (onRerunQuery && message.query?.sql) {
      onRerunQuery(message.id, message.query.sql);
    }
  };

  // Update editor ref when editing
  useEffect(() => {
    if (isEditingQuery) {
      editorRef.current = editedSql;
    }
  }, [editedSql, isEditingQuery]);

  return (
    <div
      className={cn(
        'flex w-full ai-chat-message-enter message-container',
        isUser ? 'justify-end' : 'justify-start'
      )}
      data-testid="ai-chat-message"
    >
      <Box
        className={cn(
          'max-w-[85%] rounded-lg',
          isUser
            ? 'ml-12'
            : 'mr-12'
        )}
      >
        {/* Message bubble */}
        <Paper
          className={cn(
            'transition-all duration-200 message-bubble',
            isUser
              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
              : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800',
            'shadow-sm hover:shadow-md'
          )}
          p="sm"
          radius="md"
          withBorder
        >
        <div className="space-y-2">
          {/* Message content with markdown support */}
          <div className="prose dark:prose-invert max-w-none prose-sm prose-p:my-2 prose-pre:my-2 chat-message-content">
            <ReactMarkdown
              components={{
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : '';
                  const inline = !className || !className.includes('language-');

                  if (!inline && language === 'sql' && !message.query) {
                    // SQL code block without execution
                    return (
                      <div className="my-2">
                        <Code block className="language-sql">
                          {String(children).replace(/\n$/, '')}
                        </Code>
                      </div>
                    );
                  }

                  return inline ? (
                    <Code {...props}>{children}</Code>
                  ) : (
                    <Code block {...props}>
                      {children}
                    </Code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>

          {/* Query block with actions */}
          {message.query && (
            <div className="space-y-2 mt-3">
              <Box className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <Group justify="space-between" className="mb-2">
                  <Group gap="xs">
                    <Badge size="sm" variant="dot" color="blue">
                      SQL Query
                    </Badge>
                    {message.query.executionTime && (
                      <Text size="xs" c="dimmed">
                        {message.query.executionTime}ms
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
                            onClick={handleSaveEdit}
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
                            onClick={handleEditQuery}
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
                            onClick={handleRerun}
                            data-testid="ai-chat-rerun-query"
                            className="hover:bg-gray-200 dark:hover:bg-gray-700 chat-action-button"
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
                        onChange={(value) => {
                          setEditedSql(value);
                          editorRef.current = value;
                        }}
                        colorSchemeDark={colorScheme === 'dark'}
                        onBlur={() => {}}
                        functionTooltips={{}}
                      />
                    </div>
                  </div>
                ) : (
                  <Code block className="language-sql text-xs bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700">
                    {message.query.sql}
                  </Code>
                )}
              </Box>

              {/* Query results or error */}
              {message.query.error ? (
                <Box className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <Group gap="xs">
                    <Badge size="sm" color="red" variant="dot">
                      Error
                    </Badge>
                    <Text size="sm" c="red" className="flex-1">
                      {message.query.error}
                    </Text>
                  </Group>
                </Box>
              ) : message.query.results ? (
                <Box className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden result-table-container">
                  <Box className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Badge size="sm" variant="dot" color="green" className="result-badge">
                          Results
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {message.query.results.rows.length} rows
                        </Text>
                      </Group>
                    </Group>
                  </Box>
                  <ChatResultTable results={message.query.results} />
                </Box>
              ) : null}
            </div>
          )}
        </div>
        </Paper>

        {/* Timestamp */}
        <Group justify={isUser ? 'end' : 'start'} className="mt-1 px-1">
          <Text size="xs" c="dimmed" className="message-timestamp">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Group>
      </Box>
    </div>
  );
};
