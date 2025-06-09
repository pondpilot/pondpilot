import { Textarea, ActionIcon, Text } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useState, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatInput = ({ onSendMessage, isLoading, placeholder }: ChatInputProps) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isLoading) {
      onSendMessage(trimmedMessage);
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative chat-input">
      <Textarea
        data-testid="ai-chat-input"
        placeholder={placeholder}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        minRows={1}
        maxRows={4}
        autosize
        disabled={isLoading}
        classNames={{
          input: cn(
            'pr-12 resize-none',
            'text-sm',
            'border-gray-300 dark:border-gray-700',
            'focus:border-blue-500 dark:focus:border-blue-400',
            'bg-white dark:bg-gray-900'
          ),
        }}
        styles={{
          input: {
            paddingRight: '3rem',
          },
        }}
      />
      <ActionIcon
        onClick={handleSend}
        disabled={!message.trim() || isLoading}
        loading={isLoading}
        variant="filled"
        size="sm"
        radius="md"
        className={cn(
          'absolute right-2 bottom-2',
          'transition-all duration-200',
          message.trim() && !isLoading
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
        )}
      >
        <IconSend size={16} />
      </ActionIcon>
      <Text
        size="xs"
        c="dimmed"
        className="absolute left-2 -bottom-5"
      >
        Press Enter to send, Shift+Enter for new line
      </Text>
    </div>
  );
};
