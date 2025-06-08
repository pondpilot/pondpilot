import { DotAnimation } from '@components/dots-animation';
import { Stack } from '@mantine/core';
import { ChatMessage as ChatMessageType } from '@models/ai-chat';

import { ChatMessage } from './chat-message';

interface ChatMessageListProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  error?: string;
}

export const ChatMessageList = ({ messages, isLoading, error }: ChatMessageListProps) => {
  return (
    <Stack className="gap-4">
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500" data-testid="ai-chat-loading">
          <DotAnimation />
          <span>Thinking...</span>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm" data-testid="ai-chat-error">
          Error: {error}
        </div>
      )}
    </Stack>
  );
};
