import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { Paper, Text, ActionIcon, Group, Code, Tooltip } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { ChatMessage as ChatMessageType } from '@models/ai-chat';
import { IconCopy, IconExternalLink } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';

import { QueryResultTable } from './query-result-table';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const clipboard = useClipboard();

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

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid="ai-chat-message"
    >
      <Paper
        className={`max-w-[80%] ${isUser ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}
        p="md"
        radius="md"
        withBorder
      >
        <div className="space-y-3">
          {/* Message content with markdown support */}
          <div className="prose dark:prose-invert max-w-none">
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
            <div className="space-y-2">
              <Group justify="space-between" className="mb-1">
                <Text size="sm" fw={500} c="dimmed">
                  Generated Query:
                </Text>
                <Group gap="xs">
                  <Tooltip label="Copy query">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={handleCopyQuery}
                      data-testid="ai-chat-copy-query"
                    >
                      <IconCopy size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Open in new script tab">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={handleOpenInScript}
                      data-testid="ai-chat-open-script"
                    >
                      <IconExternalLink size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <Code block className="language-sql">
                {message.query.sql}
              </Code>

              {/* Query results or error */}
              {message.query.error ? (
                <Paper className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" p="sm" withBorder>
                  <Text size="sm" c="red">
                    Query Error: {message.query.error}
                  </Text>
                </Paper>
              ) : message.query.results ? (
                <div className="mt-3">
                  <QueryResultTable results={message.query.results} />
                  {message.query.executionTime && (
                    <Text size="xs" c="dimmed" className="mt-1">
                      Execution time: {message.query.executionTime}ms
                    </Text>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <Text size="xs" c="dimmed" className="mt-2">
          {new Date(message.timestamp).toLocaleTimeString()}
        </Text>
      </Paper>
    </div>
  );
};
