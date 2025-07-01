import { ModelSelector, MentionDropdown, useMentions } from '@components/ai-shared';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Textarea, ActionIcon, Text, Box, Portal } from '@mantine/core';
import { useAppStore } from '@store/app-store';
import { IconSend } from '@tabler/icons-react';
import { getAIConfig, saveAIConfig } from '@utils/ai-config';
import { cn } from '@utils/ui/styles';
import { useState, KeyboardEvent, useRef, useEffect, useCallback } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatInput = ({
  onSendMessage,
  isLoading,
  placeholder = 'Ask a question about your data... (use @ to mention tables)',
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaRect, setTextareaRect] = useState<DOMRect | undefined>();
  const [hasMultipleRows, setHasMultipleRows] = useState(false);

  const connectionPool = useDuckDBConnectionPool();
  const sqlScripts = useAppStore((state) => state.sqlScripts);

  const {
    mentionState,
    handleInput,
    handleKeyDown: handleMentionKeyDown,
    resetMentions,
    setSelectedIndex,
  } = useMentions({
    connectionPool,
    sqlScripts,
  });

  // Define handleMentionSelect after getting resetMentions from hook
  const handleMentionSelect = useCallback(
    (suggestion: any) => {
      if (textareaRef.current) {
        // Get the current text and apply the mention
        const start = suggestion.startPos ?? mentionState.startPos;
        const end = suggestion.endPos ?? mentionState.endPos;

        // Use label for all types, with fully qualified name for tables/views/databases
        let insertValue = suggestion.label;
        if (
          (suggestion.type === 'table' ||
            suggestion.type === 'view' ||
            suggestion.type === 'database') &&
          suggestion.contextInfo
        ) {
          insertValue = `${suggestion.contextInfo}.${suggestion.label}`;
        } else if (suggestion.type === 'database') {
          insertValue = suggestion.label;
        }

        const newText = `${message.substring(0, start)}@${insertValue} ${message.substring(end)}`;
        setMessage(newText);

        // Calculate cursor position after the inserted mention
        const newCursorPos = start + 1 + insertValue.length + 1;
        setTimeout(() => {
          textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current?.focus();
        }, 0);

        // Reset mentions to close dropdown
        resetMentions();
      }
    },
    [message, mentionState.startPos, mentionState.endPos, resetMentions],
  );

  // Update textarea rect when mention state changes
  useEffect(() => {
    if (mentionState.isActive && textareaRef.current) {
      setTextareaRect(textareaRef.current.getBoundingClientRect());
    }
  }, [mentionState.isActive]);

  // Keep focus on the input
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  // Track textarea height to control scrollbar visibility
  useEffect(() => {
    if (textareaRef.current) {
      const checkHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
          const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight, 10);
          const paddingTop = parseInt(window.getComputedStyle(textarea).paddingTop, 10);
          const paddingBottom = parseInt(window.getComputedStyle(textarea).paddingBottom, 10);
          const singleRowHeight = lineHeight + paddingTop + paddingBottom;
          const currentHeight = textarea.scrollHeight;
          setHasMultipleRows(currentHeight > singleRowHeight + 5); // 5px tolerance
        }
      };

      checkHeight();
      // Also check on message change
      const observer = new ResizeObserver(checkHeight);
      observer.observe(textareaRef.current);
      return () => observer.disconnect();
    }
  }, [message]);

  // Reset mentions when component unmounts or when switching tabs
  useEffect(() => {
    return () => {
      resetMentions();
    };
  }, [resetMentions]);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isLoading) {
      onSendMessage(trimmedMessage);
      setMessage('');
      resetMentions();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Check if we need to handle mention selection
    if (mentionState.isActive && mentionState.suggestions.length > 0) {
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        const suggestion = mentionState.suggestions[mentionState.selectedIndex];
        if (suggestion) {
          handleMentionSelect(suggestion);
        }
        return;
      }
    }

    // Let mention handler process navigation keys
    if (handleMentionKeyDown(e as any)) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setMessage(newValue);
    handleInput(newValue, e.target.selectionStart || 0);
  };

  const handleMentionSelectForDropdown = (suggestion: any) => {
    handleMentionSelect({
      ...suggestion,
      startPos: mentionState.startPos,
      endPos: mentionState.endPos,
    });
    resetMentions();
  };

  const handleModelChange = (model: string) => {
    const config = getAIConfig();

    // Find the provider for this model
    let newProvider = config.provider;
    const providers = ['openai', 'anthropic', 'custom'];

    for (const provider of providers) {
      const apiKey = config.apiKeys?.[provider];
      if (apiKey) {
        // Check if this provider has this model
        const isCustomModel =
          provider === 'custom' && config.customModels?.some((m) => m.id === model);
        const isProviderModel =
          provider !== 'custom' &&
          ['gpt-4.1', 'o4-mini', 'gpt-4.1-mini', 'o3-mini'].includes(model) &&
          provider === 'openai';
        const isAnthropicModel =
          provider === 'anthropic' &&
          ['claude-opus-4-20250514', 'claude-sonnet-4-20250514'].includes(model);

        if (isCustomModel || isProviderModel || isAnthropicModel) {
          newProvider = provider;
          break;
        }
      }
    }

    saveAIConfig({ ...config, model, provider: newProvider });
  };

  return (
    <Box className="pb-6">
      <div className="flex justify-center px-4">
        <div className="relative w-full max-w-3xl">
          <div className="flex items-center justify-between mb-3 px-1">
            <Text size="xs" className="text-gray-500 dark:text-gray-400"></Text>
            <ModelSelector
              onModelChange={handleModelChange}
              compact
              size="xs"
              variant="subtle"
              data-testid="ai-chat-model-selector"
              className="opacity-70 hover:opacity-100 transition-opacity"
            />
          </div>
          <div
            className={cn(
              'relative',
              'rounded-2xl',
              'bg-gray-50 dark:bg-gray-800/50',
              'transition-all duration-200',
              'border border-gray-200 dark:border-gray-700',
              'focus-within:border-gray-300 dark:focus-within:border-gray-600',
              'focus-within:shadow-sm',
              'focus-within:-translate-y-[1px]',
              'focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.08)]',
            )}
          >
            <Textarea
              ref={textareaRef}
              data-testid="ai-chat-input"
              data-floating-scrollbar={hasMultipleRows.toString()}
              placeholder={placeholder}
              value={message}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
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
                  'pr-16 pl-4 py-3 resize-none',
                  'text-[15px] leading-relaxed',
                  'border-0',
                  'bg-transparent',
                  'placeholder:text-gray-500 dark:placeholder:text-gray-400',
                  'focus:outline-none',
                  'text-gray-900 dark:text-gray-100',
                  'scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent',
                  'dark:scrollbar-thumb-gray-600',
                  hasMultipleRows ? 'overflow-auto' : 'overflow-hidden',
                ),
                wrapper: 'border-0',
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
            <ActionIcon
              onClick={handleSend}
              disabled={!message.trim() || isLoading || mentionState.isActive}
              loading={isLoading}
              variant="subtle"
              size="lg"
              radius="md"
              className={cn(
                'absolute right-3 bottom-2',
                'transition-all duration-200',
                'hover:bg-gray-200 dark:hover:bg-gray-700',
                message.trim() && !isLoading && !mentionState.isActive
                  ? 'text-gray-700 dark:text-gray-300'
                  : 'text-gray-400 dark:text-gray-500 cursor-not-allowed',
              )}
              aria-label="Send message"
            >
              <IconSend size={20} />
            </ActionIcon>
          </div>
          <Text size="xs" className="text-center mt-2 text-gray-500" id="chat-input-help">
            Press Enter to send, Shift+Enter for new line, @ to mention tables
          </Text>
        </div>
      </div>

      {mentionState.isActive && (
        <Portal>
          <MentionDropdown
            suggestions={mentionState.suggestions}
            selectedIndex={mentionState.selectedIndex}
            onSelect={handleMentionSelectForDropdown}
            onHover={setSelectedIndex}
            anchorRect={textareaRect}
            data-testid="ai-chat-mention-dropdown"
          />
        </Portal>
      )}
    </Box>
  );
};
