import { aiChatController } from '@controllers/ai-chat';
import { saveAIChatConversations } from '@controllers/ai-chat/persist';
import { Stack, ScrollArea, Paper, Box } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { TabId, AIChatTab } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { cn } from '@utils/ui/styles';
import { useEffect, useState, useRef, useCallback } from 'react';

import { ChatInput } from './components/chat-input';
import { ChatMessageList } from './components/chat-message-list';
import { useChatAI } from './hooks/use-chat-ai';
import './ai-chat.css';

interface ChatConversationProps {
  tabId: TabId;
  active: boolean;
}

export const ChatConversation = ({ tabId }: ChatConversationProps) => {
  const tab = useAppStore((state) => state.tabs.get(tabId)) as AIChatTab | undefined;
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const conversation = tab ? aiChatController.getConversation(tab.conversationId) : undefined;
  const messages = conversation?.messages || [];

  const { sendMessage } = useChatAI();

  const scrollToBottom = useCallback(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const handleSendMessage = async (content: string) => {
    if (!tab || !conversation) return;

    setIsLoading(true);
    setError(undefined);

    try {
      // Add user message
      const userMessage = aiChatController.addMessage(conversation.id, {
        role: 'user',
        content,
        timestamp: new Date(),
      });

      if (!userMessage) {
        throw new Error('Failed to add message');
      }

      // Save conversation
      await saveAIChatConversations();

      // Send to AI and get response
      await sendMessage(conversation.id, content);

      // Save conversation after AI response
      await saveAIChatConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRerunQuery = async (messageId: string, sql: string) => {
    if (!tab || !conversation) return;

    setIsLoading(true);
    setError(undefined);

    try {
      // Find the original message
      const originalMessage = conversation.messages.find(m => m.id === messageId);
      if (!originalMessage) {
        throw new Error('Original message not found');
      }

      // Add a new user message indicating the re-run
      const userMessage = aiChatController.addMessage(conversation.id, {
        role: 'user',
        content: `Re-run the following query:\n\n\`\`\`sql\n${sql}\n\`\`\``,
        timestamp: new Date(),
      });

      if (!userMessage) {
        throw new Error('Failed to add message');
      }

      // Save conversation
      await saveAIChatConversations();

      // Send to AI for execution
      await sendMessage(conversation.id, userMessage.content, true);

      // Save conversation after execution
      await saveAIChatConversations();

      showNotification({
        message: 'Query re-executed successfully',
        color: 'green',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      showNotification({
        message: 'Failed to re-run query',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!tab || !conversation) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Chat tab not found
      </div>
    );
  }

  return (
    <Stack className="h-full gap-0 bg-gray-50 dark:bg-gray-950" data-testid="ai-chat-container">
      <ScrollArea
        className="flex-1 chat-scrollarea"
        viewportRef={scrollViewportRef}
        scrollbarSize={6}
        classNames={{
          scrollbar: 'bg-gray-200 dark:bg-gray-800',
          thumb: 'bg-gray-400 dark:bg-gray-600 hover:bg-gray-500 dark:hover:bg-gray-500',
        }}
      >
        <Box className="min-h-full flex flex-col">
          <div className="flex-1 px-4 py-3">
            <ChatMessageList
              messages={messages}
              isLoading={isLoading}
              error={error}
              onRerunQuery={handleRerunQuery}
            />
          </div>
        </Box>
      </ScrollArea>

      <Paper
        className={cn(
          'border-t border-gray-200 dark:border-gray-800',
          'bg-white dark:bg-gray-900',
          'shadow-lg'
        )}
        radius={0}
        p="sm"
      >
        <div className="max-w-4xl mx-auto">
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            placeholder="Ask a question about your data..."
          />
        </div>
      </Paper>
    </Stack>
  );
};
