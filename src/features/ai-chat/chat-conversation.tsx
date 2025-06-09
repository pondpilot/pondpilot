import { aiChatController } from '@controllers/ai-chat';
import { saveAIChatConversations } from '@controllers/ai-chat/persist';
import { Stack, ScrollArea, Box, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import { ChatMessageId } from '@models/ai-chat';
import { TabId, AIChatTab } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { classifySQLStatements, SQLStatementType } from '@utils/editor/sql';
import { cn } from '@utils/ui/styles';
import { useEffect, useState, useRef, useCallback } from 'react';

import { ChatInput } from './components/chat-input';
import { ChatMessageList } from './components/chat-message-list';
import { useAIChatSubscription } from './hooks/use-ai-chat-subscription';
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

  // Subscribe to AI chat controller changes
  useAIChatSubscription();

  const conversation = tab ? aiChatController.getConversation(tab.conversationId) : undefined;
  const messages = conversation?.messages || [];

  const { sendMessage, executeQuery } = useChatAI();

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

  const handleRerunQuery = async (messageId: ChatMessageId, sql: string) => {
    if (!tab || !conversation) return;

    // Check if SQL contains DDL statements
    const classifiedStatements = classifySQLStatements([sql]);
    const hasDDL = classifiedStatements.some((s) => s.sqlType === SQLStatementType.DDL);

    if (hasDDL) {
      // Show confirmation dialog for DDL queries
      modals.openConfirmModal({
        title: 'Execute DDL Statement?',
        centered: true,
        children: (
          <Text size="sm">
            This query contains DDL statements (CREATE, ALTER, DROP, etc.) that will modify the database structure. Are you sure you want to execute it?
          </Text>
        ),
        labels: { confirm: 'Execute', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          try {
            // Execute the query directly
            const queryResult = await executeQuery(sql);

            // Update the existing message with new results
            aiChatController.updateMessage(conversation.id, messageId, {
              query: queryResult,
            });

            // Save conversation after update
            await saveAIChatConversations();

            showNotification({
              message: queryResult.successful ? 'Query executed successfully' : 'Query execution failed',
              color: queryResult.successful ? 'green' : 'red',
            });
          } catch (err) {
            showNotification({
              message: 'Failed to execute query',
              color: 'red',
            });
          }
        },
      });
    } else {
      try {
        // Execute the query directly
        const queryResult = await executeQuery(sql);

        // Update the existing message with new results
        aiChatController.updateMessage(conversation.id, messageId, {
          query: queryResult,
        });

        // Save conversation after update
        await saveAIChatConversations();

        showNotification({
          message: queryResult.successful ? 'Query re-executed successfully' : 'Query execution failed',
          color: queryResult.successful ? 'green' : 'red',
        });
      } catch (err) {
        showNotification({
          message: 'Failed to re-run query',
          color: 'red',
        });
      }
    }
  };

  const handleUpdateMessage = async (messageId: ChatMessageId, content: string) => {
    if (!tab || !conversation) return;

    // Update the message content
    aiChatController.updateMessage(conversation.id, messageId, {
      content,
    });

    // Save conversation after update
    await saveAIChatConversations();

    showNotification({
      message: 'Message updated',
      color: 'green',
    });
  };

  const handleDeleteMessage = async (messageId: ChatMessageId) => {
    if (!tab || !conversation) return;

    // Delete the message
    aiChatController.deleteMessage(conversation.id, messageId);

    // Save conversation after update
    await saveAIChatConversations();

    showNotification({
      message: 'Message deleted',
      color: 'green',
    });
  };

  const handleRerunConversation = async (messageId: ChatMessageId, content: string) => {
    if (!tab || !conversation) return;

    setIsLoading(true);
    setError(undefined);

    try {
      // Find the index of the edited message
      const messageIndex = conversation.messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      // Delete all messages after the edited message
      const messagesToDelete = conversation.messages.slice(messageIndex + 1);
      messagesToDelete.forEach((msg) => {
        aiChatController.deleteMessage(conversation.id, msg.id);
      });

      // Save conversation after deleting messages
      await saveAIChatConversations();

      // Send the edited content to AI and get response
      await sendMessage(conversation.id, content);

      // Save conversation after AI response
      await saveAIChatConversations();

      showNotification({
        message: 'Conversation re-run successfully',
        color: 'green',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-run conversation');
      showNotification({
        message: 'Failed to re-run conversation',
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
              onUpdateMessage={handleUpdateMessage}
              onDeleteMessage={handleDeleteMessage}
              onRerunConversation={handleRerunConversation}
            />
          </div>
        </Box>
      </ScrollArea>

      <Box
        className={cn(
          'border-t border-gray-200 dark:border-gray-800',
          'bg-white dark:bg-gray-900',
          'shadow-lg',
          'px-4 py-3'
        )}
      >
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Ask a question about your data..."
        />
      </Box>
    </Stack>
  );
};
