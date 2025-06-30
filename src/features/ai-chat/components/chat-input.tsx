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
    <div className="flex justify-center">
      <div className="relative w-full max-w-2xl">
        <div
          className={cn(
            'relative chat-input',
            'rounded-full',
            'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
            'shadow-md hover:shadow-lg transition-shadow duration-200',
            'border border-borderPrimary-light dark:border-borderPrimary-dark',
          )}
        >
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
                'pr-12 pl-5 py-3 resize-none',
                'text-sm',
                'border-0',
                'bg-transparent',
                'placeholder:text-textTertiary-light dark:placeholder:text-textTertiary-dark',
                'focus:outline-none',
              ),
              wrapper: 'border-0',
            }}
            styles={{
              input: {
                paddingRight: '3rem',
              },
              wrapper: {
                backgroundColor: 'transparent',
              },
            }}
          />
          <ActionIcon
            onClick={handleSend}
            disabled={!message.trim() || isLoading}
            loading={isLoading}
            variant="filled"
            size="md"
            radius="xl"
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2',
              'transition-all duration-200',
              message.trim() && !isLoading
                ? 'bg-backgroundAccent-light hover:bg-backgroundAccent-light/90 dark:bg-backgroundAccent-dark dark:hover:bg-backgroundAccent-dark/90 text-textContrast-light dark:text-textContrast-dark'
                : 'bg-transparent008-light dark:bg-transparent008-dark text-textTertiary-light dark:text-textTertiary-dark',
            )}
            aria-label="Send message"
          >
            <IconSend size={18} />
          </ActionIcon>
        </div>
        <Text size="xs" c="dimmed" className="text-center mt-2" id="chat-input-help">
          Press Enter to send, Shift+Enter for new line
        </Text>
      </div>
    </div>
  );
};
