import { ModelSelector, MentionDropdown, useMentions } from '@components/ai-shared';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Textarea, ActionIcon, Text, Box, Portal } from '@mantine/core';
import { useAppStore } from '@store/app-store';
import { IconSend } from '@tabler/icons-react';
import { getAIConfig, saveAIConfig } from '@utils/ai-config';
import { cn } from '@utils/ui/styles';
import { useState, KeyboardEvent, useRef, useEffect, useCallback } from 'react';

interface ChatInputWithMentionsProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatInputWithMentions = ({
  onSendMessage,
  isLoading,
  placeholder = 'Ask a question about your data... (use @ to mention tables)',
}: ChatInputWithMentionsProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaRect, setTextareaRect] = useState<DOMRect | undefined>();

  const connectionPool = useDuckDBConnectionPool();
  const sqlScripts = useAppStore((state) => state.sqlScripts);

  const {
    mentionState,
    handleInput,
    handleKeyDown: handleMentionKeyDown,
    applyMention,
    resetMentions,
  } = useMentions({
    connectionPool,
    sqlScripts,
  });

  // Define handleMentionSelect after getting resetMentions from hook
  const handleMentionSelect = useCallback(
    (suggestion: any) => {
      if (textareaRef.current) {
        const cursorPos = textareaRef.current.selectionStart || 0;

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
    <Box>
      <div className="flex justify-center mb-2">
        <div className="w-full max-w-2xl flex justify-between items-center px-2">
          <Text size="xs" c="dimmed">
            Chat with your data using AI
          </Text>
          <ModelSelector
            onModelChange={handleModelChange}
            compact
            size="xs"
            variant="subtle"
            data-testid="ai-chat-model-selector"
            className="opacity-70"
          />
        </div>
      </div>
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
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              minRows={1}
              maxRows={4}
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
              disabled={!message.trim() || isLoading || mentionState.isActive}
              loading={isLoading}
              variant="filled"
              size="md"
              radius="xl"
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2',
                'transition-all duration-200',
                message.trim() && !isLoading && !mentionState.isActive
                  ? 'bg-backgroundAccent-light hover:bg-backgroundAccent-light/90 dark:bg-backgroundAccent-dark dark:hover:bg-backgroundAccent-dark/90 text-textContrast-light dark:text-textContrast-dark'
                  : 'bg-transparent008-light dark:bg-transparent008-dark text-textTertiary-light dark:text-textTertiary-dark',
              )}
              aria-label="Send message"
            >
              <IconSend size={18} />
            </ActionIcon>
          </div>
          <Text size="xs" c="dimmed" className="text-center mt-2" id="chat-input-help">
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
            anchorRect={textareaRect}
            data-testid="ai-chat-mention-dropdown"
          />
        </Portal>
      )}
    </Box>
  );
};
