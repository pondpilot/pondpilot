import { showSuccess } from '@components/app-notifications';
import { Paper, Text, ActionIcon, Group, Code, Box, Textarea } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { ChatMessage as ChatMessageType, ChatMessageId } from '@models/ai-chat';
import { IconCheck, IconX } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { MessageActions } from './message-actions';
import { SqlQueryDisplay } from './sql-query-display';
import { ChatVisualization } from './chat-visualization';

interface ChatMessageProps {
  message: ChatMessageType;
  onRerunQuery?: (messageId: ChatMessageId, sql: string) => void;
  onUpdateMessage?: (messageId: ChatMessageId, content: string) => void;
  onDeleteMessage?: (messageId: ChatMessageId) => void;
  onRerunConversation?: (messageId: ChatMessageId, content: string) => void;
}

export const ChatMessage = ({
  message,
  onRerunQuery,
  onUpdateMessage,
  onDeleteMessage,
  onRerunConversation,
}: ChatMessageProps) => {
  const clipboard = useClipboard();
  const [isRerunning, setIsRerunning] = useState(false);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  const isUser = message.role === 'user';

  const handleCopyMessage = () => {
    clipboard.copy(message.content);
    showSuccess({ title: 'Message copied to clipboard', message: '' });
  };

  const handleEditMessage = () => {
    setIsEditingMessage(true);
    setEditedContent(message.content);
  };

  const handleSaveMessageEdit = () => {
    if (onUpdateMessage && editedContent.trim()) {
      onUpdateMessage(message.id, editedContent);
      setIsEditingMessage(false);

      // For user messages, offer to re-run the conversation
      if (isUser && onRerunConversation) {
        modals.openConfirmModal({
          title: 'Re-run conversation?',
          centered: true,
          children: (
            <Text size="sm">
              Would you like to re-run the conversation from this point? This will delete all
              subsequent messages and generate a new response.
            </Text>
          ),
          labels: { confirm: 'Re-run', cancel: 'Keep existing' },
          confirmProps: { color: 'blue' },
          onConfirm: () => {
            onRerunConversation(message.id, editedContent);
          },
        });
      }
    }
  };

  const handleCancelMessageEdit = () => {
    setEditedContent(message.content);
    setIsEditingMessage(false);
  };

  const handleDeleteMessage = () => {
    if (onDeleteMessage) {
      onDeleteMessage(message.id);
    }
  };

  const handleRunQuery = async (sql: string) => {
    if (onRerunQuery) {
      setIsRerunning(true);
      try {
        await onRerunQuery(message.id, sql);
      } finally {
        setIsRerunning(false);
      }
    }
  };

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
          'max-w-4xl rounded-lg',
          isUser
            ? 'ml-auto mr-2'
            : 'mr-auto ml-2'
        )}
      >
        {/* Message bubble */}
        <Paper
          className={cn(
            'transition-all duration-200 message-bubble group',
            isUser
              ? 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark border-borderPrimary-light dark:border-borderPrimary-dark'
              : 'bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark border-borderSecondary-light dark:border-borderSecondary-dark',
            'shadow-sm hover:shadow-md'
          )}
          p="sm"
          radius="md"
          withBorder
        >
        <div className="space-y-2">
          {/* Message actions menu */}
          <Group justify="space-between" align="start">
            {isEditingMessage ? (
              <div className="flex-1">
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  minRows={2}
                  autosize
                  className="flex-1"
                />
                <Group gap="xs" mt="xs">
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    color="green"
                    onClick={handleSaveMessageEdit}
                  >
                    <IconCheck size={14} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={handleCancelMessageEdit}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              </div>
            ) : (
              <>
                {/* Message content with markdown support */}
                <div className="prose dark:prose-invert max-w-none prose-sm prose-p:my-2 prose-pre:my-2 chat-message-content flex-1 text-textPrimary-light dark:text-textPrimary-dark">
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
                <MessageActions
                  isUser={isUser}
                  onCopy={handleCopyMessage}
                  onEdit={onUpdateMessage ? handleEditMessage : undefined}
                  onDelete={onDeleteMessage ? handleDeleteMessage : undefined}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </>
            )}
          </Group>

          {/* Query block with actions - only show if no chart or if there's an error */}
          {message.query && (!message.query.chartSpec || message.query.error) && (
            <Box className="mt-3">
              <SqlQueryDisplay
                query={message.query}
                onRunQuery={handleRunQuery}
                isRerunning={isRerunning}
              />
            </Box>
          )}

          {/* Chart visualization - show as separate widget */}
          {message.query && message.query.chartSpec && !message.query.error && (
            <Box className="mt-3">
              <ChatVisualization query={message.query} />
            </Box>
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
