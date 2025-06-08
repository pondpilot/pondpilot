import { aiChatController } from '@controllers/ai-chat';
import { saveAIChatConversations } from '@controllers/ai-chat/persist';
import { Stack, ScrollArea, Paper } from '@mantine/core';
import { TabId, AIChatTab } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { useEffect, useState, useRef, useCallback } from 'react';

import { ChatInput } from './components/chat-input';
import { ChatMessageList } from './components/chat-message-list';
import { useChatAI } from './hooks/use-chat-ai';

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

  if (!tab || !conversation) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Chat tab not found
      </div>
    );
  }

  return (
    <Stack className="h-full gap-0" data-testid="ai-chat-container">
      <ScrollArea
        className="flex-1"
        viewportRef={scrollViewportRef}
        scrollbarSize={8}
      >
        <div className="p-4">
          <ChatMessageList messages={messages} isLoading={isLoading} error={error} />
        </div>
      </ScrollArea>

      <Paper className="border-t" radius={0} p="md">
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Ask a question about your data..."
        />
      </Paper>
    </Stack>
  );
};
