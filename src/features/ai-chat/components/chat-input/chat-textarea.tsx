import { Textarea } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { forwardRef, KeyboardEvent } from 'react';

import { chatInputStyles } from './styles';

interface ChatTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  placeholder?: string;
  hasMultipleRows: boolean;
  mentionState: {
    isActive: boolean;
    selectedIndex: number;
  };
}

export const ChatTextarea = forwardRef<HTMLTextAreaElement, ChatTextareaProps>(
  (
    {
      value,
      onChange,
      onKeyDown,
      isLoading,
      placeholder = 'Ask a question about your data... (use @ to mention tables)',
      hasMultipleRows,
      mentionState,
    },
    ref,
  ) => {
    return (
      <Textarea
        ref={ref}
        data-testid="ai-chat-input"
        data-floating-scrollbar={hasMultipleRows.toString()}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        minRows={1}
        maxRows={6}
        autosize
        disabled={isLoading}
        aria-label="Chat message input"
        aria-describedby="chat-input-help"
        aria-expanded={mentionState.isActive}
        aria-autocomplete={mentionState.isActive ? 'list' : undefined}
        aria-controls={mentionState.isActive ? 'mention-dropdown' : undefined}
        aria-activedescendant={
          mentionState.isActive && mentionState.selectedIndex >= 0
            ? `mention-option-${mentionState.selectedIndex}`
            : undefined
        }
        classNames={{
          input: cn(
            chatInputStyles.textarea.input,
            hasMultipleRows ? 'overflow-auto' : 'overflow-hidden',
          ),
          wrapper: chatInputStyles.textarea.wrapper,
        }}
        styles={{
          input: {
            paddingRight: '4rem',
          },
          wrapper: {
            backgroundColor: 'transparent',
          },
        }}
      />
    );
  },
);

ChatTextarea.displayName = 'ChatTextarea';
