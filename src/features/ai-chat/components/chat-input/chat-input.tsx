import { ModelSelector, MentionDropdown } from '@components/ai-shared';
import { Text, Box, Portal } from '@mantine/core';
import { AI_PROVIDERS } from '@models/ai-service';
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

    // Find the provider for this model by checking AI_PROVIDERS
    let newProvider = config.provider;
    let reasoning = config.reasoning || false;

    // First, find which provider has this model (regardless of API key)
    for (const provider of AI_PROVIDERS) {
      // Check if this provider has this model
      const hasModel = provider.models.some((m) => m.id === model);

      // For custom provider, also check custom models
      const hasCustomModel =
        provider.id === 'custom' && config.customModels?.some((m) => m.id === model);

      if (hasModel || hasCustomModel) {
        newProvider = provider.id;

        // Update reasoning flag based on the selected model
        const selectedModel = provider.models.find((m) => m.id === model);
        reasoning = selectedModel?.reasoning || false;

        // Get the API key for this provider
        const apiKey = config.apiKeys?.[provider.id] || '';

        saveAIConfig({ ...config, model, provider: newProvider, reasoning, apiKey });
        return;
      }
    }

    // If we get here, just update the model without changing provider
    saveAIConfig({ ...config, model });
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
