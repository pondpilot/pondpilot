import { aiChatController } from '@controllers/ai-chat';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ChatConversationId } from '@models/ai-chat';
import { useAppStore } from '@store/app-store';
import { getAIConfig } from '@utils/ai-config';
import { getAIService } from '@utils/ai-service';
import { useCallback, useRef } from 'react';

import { MessageProcessingService } from '../services';
import { useQueryExecution } from './use-query-execution';

export const useChatAI = () => {
  const duckDbConnectionPool = useDuckDBConnectionPool();
  const { executeQuery } = useQueryExecution();
  const sqlScripts = useAppStore((state) => state.sqlScripts);

  // Track active requests to prevent race conditions
  const activeRequestsRef = useRef<Map<string, AbortController>>(new Map());
  const requestCounterRef = useRef(0);

  const sendMessage = useCallback(
    async (conversationId: ChatConversationId, userMessage: string) => {
      const conversation = aiChatController.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Create a unique request ID
      requestCounterRef.current += 1;
      const requestId = `${conversationId}-${requestCounterRef.current}`;
      const abortController = new AbortController();

      // Cancel any previous pending requests for this conversation
      activeRequestsRef.current.forEach((controller, id) => {
        if (id.startsWith(conversationId)) {
          controller.abort();
          activeRequestsRef.current.delete(id);
        }
      });

      // Track this request
      activeRequestsRef.current.set(requestId, abortController);

      if (!duckDbConnectionPool) {
        throw new Error('Database connection not available');
      }

      try {
        // Get AI service
        const config = getAIConfig();
        const aiService = getAIService(config);

        // Process the message using the service
        await MessageProcessingService.processMessage({
          conversationId,
          userMessage,
          duckDbConnectionPool,
          sqlScripts,
          executeQuery,
          aiService,
          abortSignal: abortController.signal,
        });
      } catch (error) {
        // Clean up the request tracking
        activeRequestsRef.current.delete(requestId);
        throw error;
      }

      // Clean up request tracking
      activeRequestsRef.current.delete(requestId);
    },
    [duckDbConnectionPool, executeQuery, sqlScripts],
  );

  // Clean up function to cancel all active requests
  const cancelAllRequests = useCallback(() => {
    activeRequestsRef.current.forEach((controller) => {
      controller.abort();
    });
    activeRequestsRef.current.clear();
  }, []);

  return {
    sendMessage,
    executeQuery,
    cancelAllRequests,
  };
};
