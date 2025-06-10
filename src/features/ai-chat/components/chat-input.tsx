import { Textarea, ActionIcon, Text } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useState, KeyboardEvent, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatInput = ({ onSendMessage, isLoading, placeholder }: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep focus on the input
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

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
    <div className="space-y-1">
      <div className="relative chat-input">
        <Textarea
          ref={textareaRef}
          data-testid="ai-chat-input"
          placeholder={placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          minRows={1}
          maxRows={4}
          autosize
          disabled={isLoading}
          aria-label="Chat message input"
          aria-describedby="chat-input-help"
          classNames={{
            input: cn(
              'pr-12 resize-none',
              'text-sm',
              'border-borderPrimary-light dark:border-borderPrimary-dark',
              'focus:border-borderAccent-light dark:focus:border-borderAccent-dark',
              'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark'
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
              ? 'bg-backgroundAccent-light hover:bg-backgroundAccent-light/90 dark:bg-backgroundAccent-dark dark:hover:bg-backgroundAccent-dark/90 text-textContrast-light dark:text-textContrast-dark'
              : 'bg-transparent008-light dark:bg-transparent008-dark text-textTertiary-light dark:text-textTertiary-dark'
          )}
          aria-label="Send message"
        >
          <IconSend size={16} />
        </ActionIcon>
      </div>
      <Text size="xs" c="dimmed" className="px-2" id="chat-input-help">
        Press Enter to send, Shift+Enter for new line
      </Text>
    </div>
  );
};
