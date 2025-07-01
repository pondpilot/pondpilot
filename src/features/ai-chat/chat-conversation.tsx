import { showSuccess, showError } from '@components/app-notifications';
import { aiChatController } from '@controllers/ai-chat';
import { Stack, ScrollArea, Box, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { ChatMessageId } from '@models/ai-chat';
import { TabId, AIChatTab } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { classifySQLStatements, SQLStatementType } from '@utils/editor/sql';
import { cn } from '@utils/ui/styles';
import { useEffect, useState, useRef, useCallback } from 'react';

import { ChatErrorBoundary } from './components/chat-error-boundary';
import { ChatInput } from './components/chat-input';
import { ChatMessageList } from './components/chat-message-list';
import { PrivacyNotification } from './components/privacy-notification';
import { useAIChatSubscription } from './hooks/use-ai-chat-subscription';
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

      // Send to AI and get response
      await sendMessage(conversation.id, content);
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
            This query contains DDL statements (CREATE, ALTER, DROP, etc.) that will modify the
            database structure. Are you sure you want to execute it?
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

            if (queryResult.successful) {
              showSuccess({ title: 'Query executed successfully', message: '' });
            } else {
              showError({ title: 'Query execution failed', message: '' });
            }
          } catch (err) {
            showError({ title: 'Failed to execute query', message: '' });
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

        if (queryResult.successful) {
          showSuccess({ title: 'Query re-executed successfully', message: '' });
        } else {
          showError({ title: 'Query execution failed', message: '' });
        }
      } catch (err) {
        showError({ title: 'Failed to re-run query', message: '' });
      }
    }
  };

  const handleUpdateMessage = async (messageId: ChatMessageId, content: string) => {
    if (!tab || !conversation) return;

    // Update the message content
    aiChatController.updateMessage(conversation.id, messageId, {
      content,
    });

    showSuccess({ title: 'Message updated', message: '' });
  };

  const handleDeleteMessage = async (messageId: ChatMessageId) => {
    if (!tab || !conversation) return;

    // Delete the message
    aiChatController.deleteMessage(conversation.id, messageId);

    showSuccess({ title: 'Message deleted', message: '' });
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

      // Send the edited content to AI and get response
      await sendMessage(conversation.id, content);

      showSuccess({ title: 'Conversation re-run successfully', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-run conversation');
      showError({ title: 'Failed to re-run conversation', message: '' });
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
    <Stack
      className="h-full gap-0 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark"
      data-testid="ai-chat-container"
    >
      <ScrollArea
        className="flex-1"
        viewportRef={scrollViewportRef}
        scrollbarSize={6}
        classNames={{
          scrollbar: 'bg-transparent008-light dark:bg-transparent008-dark',
          thumb:
            'bg-transparent032-light dark:bg-transparent032-dark hover:bg-transparent072-light dark:hover:bg-transparent072-dark transition-colors duration-200',
        }}
      >
        <Box className="min-h-full flex flex-col">
          <div className="flex-1 px-4 py-3">
            <PrivacyNotification />
            <ChatErrorBoundary>
              <ChatMessageList
                messages={messages}
                isLoading={isLoading}
                error={error}
                onRerunQuery={handleRerunQuery}
                onUpdateMessage={handleUpdateMessage}
                onDeleteMessage={handleDeleteMessage}
                onRerunConversation={handleRerunConversation}
              />
            </ChatErrorBoundary>
          </div>
        </Box>
      </ScrollArea>

      <Box className={cn('bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark', 'px-4 py-4')}>
        <ChatErrorBoundary>
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </ChatErrorBoundary>
      </Box>
    </Stack>
  );
};
