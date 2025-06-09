import { DotAnimation } from '@components/dots-animation';
import { Stack, Paper, Text } from '@mantine/core';
import { ChatMessage as ChatMessageType, ChatMessageId } from '@models/ai-chat';
import { IconAlertCircle } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';

import { ChatMessage } from './chat-message';

interface ChatMessageListProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  error?: string;
  onRerunQuery?: (messageId: ChatMessageId, sql: string) => void;
  onUpdateMessage?: (messageId: ChatMessageId, content: string) => void;
  onDeleteMessage?: (messageId: ChatMessageId) => void;
  onRerunConversation?: (messageId: ChatMessageId, content: string) => void;
}

export const ChatMessageList = ({
  messages,
  isLoading,
  error,
  onRerunQuery,
  onUpdateMessage,
  onDeleteMessage,
  onRerunConversation,
}: ChatMessageListProps) => {
  return (
    <Stack className="gap-3">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onRerunQuery={onRerunQuery}
          onUpdateMessage={onUpdateMessage}
          onDeleteMessage={onDeleteMessage}
          onRerunConversation={onRerunConversation}
        />
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <Paper
            className={cn(
              'bg-gray-50 dark:bg-gray-900/30',
              'border-gray-200 dark:border-gray-800',
              'shadow-sm px-4 py-3',
              'chat-loading-message ai-chat-message-enter'
            )}
            radius="md"
            withBorder
            data-testid="ai-chat-loading"
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <DotAnimation />
              <Text size="sm">Thinking...</Text>
            </div>
          </Paper>
        </div>
      )}

      {error && (
        <div className="flex justify-start">
          <Paper
            className={cn(
              'bg-red-50 dark:bg-red-950/30',
              'border-red-200 dark:border-red-800',
              'shadow-sm px-4 py-3'
            )}
            radius="md"
            withBorder
          >
            <div className="flex items-center gap-2">
              <IconAlertCircle size={16} className="text-red-500" />
              <Text size="sm" c="red">
                {error}
              </Text>
            </div>
          </Paper>
        </div>
      )}
    </Stack>
  );
};
