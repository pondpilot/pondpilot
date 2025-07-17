import { ModelSelector, MentionDropdown } from '@components/ai-shared';
import { Text, Box, Portal } from '@mantine/core';
import { getAIConfig, saveAIConfig } from '@utils/ai-config';
import { cn } from '@utils/ui/styles';

import { ChatTextarea } from './chat-textarea';
import { SendButton } from './send-button';
import { chatInputStyles } from './styles';
import { useChatInput } from './use-chat-input';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatInput = ({ onSendMessage, isLoading, placeholder }: ChatInputProps) => {
  const {
    message,
    textareaRef,
    textareaRect,
    hasMultipleRows,
    mentionState,
    handleSend,
    handleKeyDown,
    handleTextChange,
    handleMentionSelectForDropdown,
    setSelectedIndex,
  } = useChatInput({ onSendMessage, isLoading });

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
    <Box className={chatInputStyles.container}>
      <div className={chatInputStyles.wrapper}>
        <div className={chatInputStyles.innerWrapper}>
          <div className={chatInputStyles.header}>
            <Text size="xs" className="text-gray-500 dark:text-gray-400"></Text>
            <ModelSelector
              onModelChange={handleModelChange}
              compact
              size="xs"
              variant="subtle"
              data-testid="ai-chat-model-selector"
              className={chatInputStyles.modelSelector}
            />
          </div>
          <div className={cn(chatInputStyles.inputContainer)}>
            <ChatTextarea
              ref={textareaRef}
              value={message}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              isLoading={isLoading}
              placeholder={placeholder}
              hasMultipleRows={hasMultipleRows}
              mentionState={{
                isActive: mentionState.isActive,
                selectedIndex: mentionState.selectedIndex,
              }}
            />
            <SendButton
              onClick={handleSend}
              isDisabled={!message.trim() || isLoading || mentionState.isActive}
              isLoading={isLoading}
            />
          </div>
          <Text size="xs" className={chatInputStyles.helpText} id="chat-input-help">
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
