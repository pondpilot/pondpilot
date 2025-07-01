import { aiChatController } from '@controllers/ai-chat';
import { saveAIChatConversations } from '@controllers/ai-chat/persist';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ChatConversationId } from '@models/ai-chat';
import { VegaLiteSpec, isValidVegaLiteSpec } from '@models/vega-lite';
import { useAppStore } from '@store/app-store';
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
  formatResultsForContext,
  analyzeChartableData,
  userWantsVisualization,
} from '../utils';
import { useQueryExecution } from './use-query-execution';

export const useChatAI = () => {
  const duckDbConnectionPool = useDuckDBConnectionPool();
  const { executeQuery } = useQueryExecution();
  const sqlScripts = useAppStore((state) => state.sqlScripts);

  // Function to build script context from @query mentions
  const buildScriptContext = useCallback(
    (message: string): string | undefined => {
      // Find all @mentions
      const mentions = message.match(/@(\w+)/g);
      if (!mentions) return undefined;

      const scriptContents: string[] = [];

      // Check each mention against scripts
      for (const mention of mentions) {
        const mentionName = mention.substring(1); // Remove @

        // Find script by name in the Map
        for (const [_scriptId, script] of sqlScripts.entries()) {
          if (script.name.toLowerCase() === mentionName.toLowerCase()) {
            scriptContents.push(`-- Script: ${script.name}\n${script.content}`);
            break;
          }
        }
      }

      if (scriptContents.length > 0) {
        return `Referenced SQL Scripts:\n\n${scriptContents.join('\n\n')}`;
      }

      return undefined;
    },
    [sqlScripts]
  );

  const generateChartFromResults = useCallback(
    async (query: string, results: any, userIntent: string) => {
      const config = getAIConfig();
      const aiService = getAIService(config);

      const chartPrompt = `Given this SQL query and its results, create a Vega-Lite visualization.

User's request: ${userIntent}

SQL Query:
${query}

Query Results:
${formatResultsForContext(results)}

Generate ONLY a Vega-Lite specification that best visualizes this data. Consider:
- The user's intent and what they're trying to understand
- The data types and structure
- The most appropriate chart type (bar, line, scatter, etc.)
- Clear titles and axis labels

Respond with ONLY the JSON specification, no explanation:`;

      const response = await aiService.generateSQLAssistance({
        prompt: chartPrompt,
        useStructuredResponse: false,
        schemaContext: '',
      });

      if (!response.success || !response.content) {
        return null;
      }

      try {
        // Try to parse the JSON directly
        const cleanContent = response.content.trim();
        // Remove markdown code block if present
        const jsonContent = cleanContent.replace(/```json\n?|\n?```/g, '').trim();
        const parsedSpec = JSON.parse(jsonContent);

        // Validate the spec structure
        if (!isValidVegaLiteSpec(parsedSpec)) {
          console.error('Invalid Vega-Lite specification structure');
          return null;
        }

        return parsedSpec as VegaLiteSpec;
      } catch (e) {
        console.error('Failed to parse chart specification:', e);
        return null;
      }
    },
    [],
  );

  // Helper function to generate and save chat title
  const generateAndSaveChatTitle = useCallback(
    async (conversationId: ChatConversationId, userMessage: string, assistantResponse: string) => {
      const titleConfig = getAIConfig();
      const titleService = getAIService(titleConfig);

      // Generate title asynchronously (don't block the UI)
      titleService.generateChatTitle(userMessage, assistantResponse).then(async (title) => {
        if (title && title !== 'New Chat') {
          aiChatController.updateConversation(conversationId, { title });
          await saveAIChatConversations();
        }
      });
    },
    [],
  );

  const sendMessage = useCallback(
    async (conversationId: ChatConversationId, userMessage: string) => {
      const conversation = aiChatController.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check if this is the first exchange (only user message exists)
      const isFirstExchange =
        conversation.messages.length === 1 && conversation.messages[0]?.role === 'user';

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

      // Build script context from @mentions
      const scriptContext = buildScriptContext(userMessage);

      // Combine schema and script contexts
      let combinedContext = schemaContext;
      if (scriptContext) {
        combinedContext = `${schemaContext}\n\n${scriptContext}`;
      }

      // Build the prompt for the AI
      const systemPrompt = buildSystemPrompt(combinedContext);

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

      // Handle explanation-only responses
      if (parsed.explanation && !parsed.sql) {
        // Just add the explanation as a message
        aiChatController.addMessage(conversationId, {
          role: 'assistant',
          content: parsed.explanation,
          timestamp: new Date(),
        });

        // Generate title if this was the first exchange
        if (isFirstExchange) {
          await generateAndSaveChatTitle(conversationId, userMessage, parsed.explanation);
        }
      } else if (parsed.sql && parsed.explanation) {
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

          // Generate chart if results are suitable
          let generatedChartSpec = chartSpec;
          if (!generatedChartSpec && queryResult.successful && queryResult.results) {
            const dataAnalysis = analyzeChartableData(queryResult.results);

            // Generate chart ONLY if user explicitly wants visualization
            if (userWantsVisualization(userMessage) && dataAnalysis.isChartable) {
              // First update to show loading state
              aiChatController.updateMessage(conversationId, aiMessage.id, {
                query: {
                  ...queryResult,
                  isGeneratingChart: true,
                },
              });

              // Generate the chart
              generatedChartSpec = await generateChartFromResults(
                sql,
                queryResult.results,
                userMessage,
              );
            }
          }

          // Update the message with query results and chart spec
          aiChatController.updateMessage(conversationId, aiMessage.id, {
            query: {
              ...queryResult,
              chartSpec: generatedChartSpec,
              isGeneratingChart: false,
            },
          });
        }

        // Generate title if this was the first exchange
        if (isFirstExchange) {
          await generateAndSaveChatTitle(conversationId, userMessage, explanation);
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
          await generateAndSaveChatTitle(conversationId, userMessage, content);
        }
      }
    },
    [duckDbConnectionPool, executeQuery, generateChartFromResults, buildScriptContext, generateAndSaveChatTitle],
  );

  return {
    sendMessage,
    executeQuery,
  };
};
