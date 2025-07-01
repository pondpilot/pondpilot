import { aiChatController } from '@controllers/ai-chat';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ChatConversationId, ChatMessageId } from '@models/ai-chat';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { classifySQLStatements, SQLStatementType } from '@utils/editor/sql';

import {
  AI_MODEL_CONTEXT_LIMIT,
  buildSystemPrompt,
  buildConversationContext,
  parseAIResponse,
  fetchDatabaseSchema,
  analyzeChartableData,
  userWantsVisualization,
} from '../utils';
import { ChartGenerationService } from './chart-generation-service';
import { ScriptContextService } from './script-context-service';
import { TitleGenerationService } from './title-generation-service';

interface ProcessMessageOptions {
  conversationId: ChatConversationId;
  userMessage: string;
  duckDbConnectionPool: AsyncDuckDBConnectionPool;
  sqlScripts: Map<SQLScriptId, SQLScript>;
  executeQuery: (sql: string) => Promise<any>;
  aiService: any;
  abortSignal?: AbortSignal;
}

/**
 * Service for processing AI chat messages
 */
export class MessageProcessingService {
  /**
   * Process a user message and generate AI response
   */
  static async processMessage(options: ProcessMessageOptions): Promise<void> {
    const {
      conversationId,
      userMessage,
      duckDbConnectionPool,
      sqlScripts,
      executeQuery,
      aiService,
      abortSignal,
    } = options;

    const conversation = aiChatController.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Check if this is the first exchange
    const isFirstExchange =
      conversation.messages.length === 1 && conversation.messages[0]?.role === 'user';

    // Get trimmed conversation history for context
    const contextMessages = aiChatController.getTrimmedMessages(
      conversationId,
      AI_MODEL_CONTEXT_LIMIT,
    );

    // Get full database schema
    const schemaContext = await fetchDatabaseSchema(duckDbConnectionPool);

    // Build script context from @mentions
    const scriptContext = ScriptContextService.buildScriptContext(userMessage, sqlScripts);

    // Combine schema and script contexts
    let combinedContext = schemaContext;
    if (scriptContext) {
      combinedContext = `${schemaContext}\n\n${scriptContext}`;
    }

    // Build the prompt for the AI
    const systemPrompt = buildSystemPrompt(combinedContext);
    const conversationContext = buildConversationContext(contextMessages);
    const fullPrompt = `${conversationContext}User: ${userMessage}`;

    // Call AI service
    const response = await aiService.generateSQLAssistance({
      prompt: fullPrompt,
      useStructuredResponse: false,
      schemaContext: systemPrompt,
    });

    // Check if request was aborted
    if (abortSignal?.aborted) {
      return;
    }

    if (!response.success) {
      throw new Error(response.error || 'AI request failed');
    }

    const content = response.content || '';
    const parsed = parseAIResponse(content);

    // Handle different response types
    await this.handleAIResponse({
      conversationId,
      parsed,
      userMessage,
      executeQuery,
      isFirstExchange,
      abortSignal,
    });
  }

  private static async handleAIResponse(options: {
    conversationId: ChatConversationId;
    parsed: ReturnType<typeof parseAIResponse>;
    userMessage: string;
    executeQuery: (sql: string) => Promise<any>;
    isFirstExchange: boolean;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const { conversationId, parsed, userMessage, executeQuery, isFirstExchange, abortSignal } =
      options;

    // Handle explanation-only responses
    if (parsed.explanation && !parsed.sql) {
      aiChatController.addMessage(conversationId, {
        role: 'assistant',
        content: parsed.explanation,
        timestamp: new Date(),
      });

      if (isFirstExchange) {
        await TitleGenerationService.generateAndSaveChatTitle(
          conversationId,
          userMessage,
          parsed.explanation,
        );
      }
      return;
    }

    // Handle SQL responses
    if (parsed.sql && parsed.explanation) {
      await this.handleSQLResponse({
        conversationId,
        sql: parsed.sql,
        explanation: parsed.explanation,
        chartSpec: parsed.chartSpec,
        userMessage,
        executeQuery,
        isFirstExchange,
        abortSignal,
      });
      return;
    }

    // No SQL found, just add the response as a message
    aiChatController.addMessage(conversationId, {
      role: 'assistant',
      content: parsed.content || '',
      timestamp: new Date(),
    });

    if (isFirstExchange) {
      await TitleGenerationService.generateAndSaveChatTitle(
        conversationId,
        userMessage,
        parsed.content || '',
      );
    }
  }

  private static async handleSQLResponse(options: {
    conversationId: ChatConversationId;
    sql: string;
    explanation: string;
    chartSpec?: any;
    userMessage: string;
    executeQuery: (sql: string) => Promise<any>;
    isFirstExchange: boolean;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const {
      conversationId,
      sql,
      explanation,
      chartSpec,
      userMessage,
      executeQuery,
      isFirstExchange,
      abortSignal,
    } = options;

    // Check if SQL contains DDL statements
    const classifiedStatements = classifySQLStatements([sql]);
    const hasDDL = classifiedStatements.some((s) => s.sqlType === SQLStatementType.DDL);

    if (hasDDL) {
      // Handle DDL queries
      const aiMessage = aiChatController.addMessage(conversationId, {
        role: 'assistant',
        content: `${explanation}\n\n⚠️ This query contains DDL statements (CREATE, ALTER, DROP, etc.) and was not executed automatically. You can run it manually using the button below.`,
        timestamp: new Date(),
      });

      if (aiMessage) {
        aiChatController.updateMessage(conversationId, aiMessage.id as ChatMessageId, {
          query: {
            sql,
            successful: false,
            executionTime: 0,
            error: undefined,
            results: undefined,
            chartSpec,
          },
        });
      }
    } else {
      // Handle regular queries
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

      // Generate chart if needed
      let generatedChartSpec = chartSpec;
      let chartGenerationError: string | undefined;

      if (!generatedChartSpec && queryResult.successful && queryResult.results) {
        const chartResult = await this.generateChartIfNeeded({
          conversationId,
          messageId: aiMessage.id as ChatMessageId,
          sql,
          queryResult,
          userMessage,
          abortSignal,
        });

        if (chartResult) {
          generatedChartSpec = chartResult.chartSpec;
          chartGenerationError = chartResult.error || undefined;
        }
      }

      // Update the message with results
      aiChatController.updateMessage(conversationId, aiMessage.id as ChatMessageId, {
        query: {
          ...queryResult,
          chartSpec: generatedChartSpec,
          isGeneratingChart: false,
          chartGenerationError,
        },
      });
    }

    if (isFirstExchange) {
      await TitleGenerationService.generateAndSaveChatTitle(
        conversationId,
        userMessage,
        explanation,
      );
    }
  }

  private static async generateChartIfNeeded(options: {
    conversationId: ChatConversationId;
    messageId: ChatMessageId;
    sql: string;
    queryResult: any;
    userMessage: string;
    abortSignal?: AbortSignal;
  }): Promise<{ chartSpec: any; error: string | null } | undefined> {
    const { conversationId, messageId, sql, queryResult, userMessage, abortSignal } = options;

    const dataAnalysis = analyzeChartableData(queryResult.results);

    // Generate chart ONLY if user explicitly wants visualization
    if (!userWantsVisualization(userMessage) || !dataAnalysis.isChartable) {
      return undefined;
    }

    // Update to show loading state
    aiChatController.updateMessage(conversationId, messageId as ChatMessageId, {
      query: {
        ...queryResult,
        isGeneratingChart: true,
      },
    });

    try {
      const chartSpec = await ChartGenerationService.generateChartFromResults(
        sql,
        queryResult.results,
        userMessage,
      );

      // Check if request was aborted
      if (abortSignal?.aborted) {
        return undefined;
      }

      return { chartSpec, error: null };
    } catch (chartError) {
      console.error('Chart generation failed:', chartError);
      // Return with error message
      const errorMessage =
        chartError instanceof Error ? chartError.message : 'Failed to generate chart visualization';
      return { chartSpec: null, error: errorMessage };
    }
  }
}
