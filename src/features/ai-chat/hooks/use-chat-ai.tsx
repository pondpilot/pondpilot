import { aiChatController } from '@controllers/ai-chat';
import { saveAIChatConversations } from '@controllers/ai-chat/persist';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ChatConversationId } from '@models/ai-chat';
import { getAIConfig } from '@utils/ai-config';
import { getAIService } from '@utils/ai-service';
import { classifySQLStatements, SQLStatementType } from '@utils/editor/sql';
import { useCallback } from 'react';

import {
  AI_MODEL_CONTEXT_LIMIT,
  buildSystemPrompt,
  buildConversationContext,
  parseAIResponse,
  fetchDatabaseSchema,
} from '../utils';
import { useQueryExecution } from './use-query-execution';

export const useChatAI = () => {
  const duckDbConnectionPool = useDuckDBConnectionPool();
  const { executeQuery } = useQueryExecution();

  const sendMessage = useCallback(async (
    conversationId: ChatConversationId,
    userMessage: string,
  ) => {
    const conversation = aiChatController.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Check if this is the first exchange (only user message exists)
    const isFirstExchange = conversation.messages.length === 1 && conversation.messages[0]?.role === 'user';

    // Get trimmed conversation history for context
    const contextMessages = aiChatController.getTrimmedMessages(
      conversationId,
      AI_MODEL_CONTEXT_LIMIT,
    );

    if (!duckDbConnectionPool) {
      throw new Error('Database connection not available');
    }

    // Get full database schema
    const schemaContext = await fetchDatabaseSchema(duckDbConnectionPool);

    // Build the prompt for the AI
    const systemPrompt = buildSystemPrompt(schemaContext);

    // Build conversation context with full query results
    const conversationContext = buildConversationContext(contextMessages);

    const fullPrompt = `${conversationContext}User: ${userMessage}`;

    // Call AI service
    const config = getAIConfig();
    const aiService = getAIService(config);

    const response = await aiService.generateSQLAssistance({
      prompt: fullPrompt,
      useStructuredResponse: false,
      schemaContext: systemPrompt,
    });

    if (!response.success) {
      throw new Error(response.error || 'AI request failed');
    }

    const content = response.content || '';

    // Parse response to extract SQL and chart spec
    const parsed = parseAIResponse(content);

    if (parsed.sql && parsed.explanation) {
      const { sql, explanation, chartSpec } = parsed;

      // Check if SQL contains DDL statements
      const classifiedStatements = classifySQLStatements([sql]);
      const hasDDL = classifiedStatements.some((s) => s.sqlType === SQLStatementType.DDL);

      if (hasDDL) {
        // Add AI message with explanation and SQL query object (without executing)
        const aiMessage = aiChatController.addMessage(conversationId, {
          role: 'assistant',
          content: `${explanation}\n\n⚠️ This query contains DDL statements (CREATE, ALTER, DROP, etc.) and was not executed automatically. You can run it manually using the button below.`,
          timestamp: new Date(),
        });

        if (!aiMessage) {
          throw new Error('Failed to add AI message');
        }

        // Add the query object without results (so it shows the SQL with run button)
        aiChatController.updateMessage(conversationId, aiMessage.id, {
          query: {
            sql,
            successful: false,
            executionTime: 0,
            error: undefined,
            results: undefined,
            chartSpec,
          },
        });
      } else {
        // Add AI message with explanation
        const aiMessage = aiChatController.addMessage(conversationId, {
          role: 'assistant',
          content: explanation,
          timestamp: new Date(),
        });

        if (!aiMessage) {
          throw new Error('Failed to add AI message');
        }

        // Execute the query
        const queryResult = await executeQuery(sql);

        // Update the message with query results and chart spec
        aiChatController.updateMessage(conversationId, aiMessage.id, {
          query: {
            ...queryResult,
            chartSpec,
          },
        });
      }

      // Generate title if this was the first exchange
      if (isFirstExchange) {
        const titleConfig = getAIConfig();
        const titleService = getAIService(titleConfig);

        // Generate title asynchronously (don't block the UI)
        titleService.generateChatTitle(userMessage, explanation).then(async (title) => {
          if (title && title !== 'New Chat') {
            aiChatController.updateConversation(conversationId, { title });
            await saveAIChatConversations();
          }
        });
      }
    } else {
      // No SQL found, just add the response as a message
      aiChatController.addMessage(conversationId, {
        role: 'assistant',
        content,
        timestamp: new Date(),
      });

      // Generate title if this was the first exchange
      if (isFirstExchange) {
        const titleConfig2 = getAIConfig();
        const titleService2 = getAIService(titleConfig2);

        // Generate title asynchronously (don't block the UI)
        titleService2.generateChatTitle(userMessage, content).then(async (title) => {
          if (title && title !== 'New Chat') {
            aiChatController.updateConversation(conversationId, { title });
            await saveAIChatConversations();
          }
        });
      }
    }
  }, [duckDbConnectionPool, executeQuery]);

  return {
    sendMessage,
    executeQuery,
  };
};
