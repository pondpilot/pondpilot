import { aiChatController } from '@controllers/ai-chat';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ChatConversationId, ChatMessageQuery, QueryResults } from '@models/ai-chat';
import { getAIConfig } from '@utils/ai-config';
import { getAIService } from '@utils/ai-service';
import { classifySQLStatements, SQLStatementType } from '@utils/editor/sql';
import { useCallback } from 'react';

const MAX_RESULT_ROWS = 100;
const AI_MODEL_CONTEXT_LIMIT = 8000; // Conservative limit for context management

export const useChatAI = () => {
  const duckDbConnectionPool = useDuckDBConnectionPool();

  const executeQuery = useCallback(async (sql: string): Promise<ChatMessageQuery> => {
    const startTime = Date.now();

    if (!duckDbConnectionPool) {
      return {
        sql,
        successful: false,
        error: 'Database connection not available',
        executionTime: 0,
      };
    }

    try {
      const result = await duckDbConnectionPool.query(sql);
      const proto = result.toArray();

        // Convert to our format and limit rows
        const columns = result.schema.fields.map((field: any) => field.name);
        const rows = proto.slice(0, MAX_RESULT_ROWS).map((row: any) => {
          return columns.map((col: string) => row[col]);
        });

        const queryResults: QueryResults = {
          columns,
          rows,
          rowCount: rows.length,
          truncated: proto.length > MAX_RESULT_ROWS,
        };

      return {
        sql,
        successful: true,
        results: queryResults,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        sql,
        successful: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        executionTime: Date.now() - startTime,
      };
    }
  }, [duckDbConnectionPool]);

  const sendMessage = useCallback(async (
    conversationId: ChatConversationId,
    userMessage: string,
    isRerun: boolean = false,
  ) => {
    const conversation = aiChatController.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Get trimmed conversation history for context
    const contextMessages = aiChatController.getTrimmedMessages(
      conversationId,
      AI_MODEL_CONTEXT_LIMIT,
    );

    if (!duckDbConnectionPool) {
      throw new Error('Database connection not available');
    }

    // Get full database schema
    let schemaContext = '';
    try {
      const result = await duckDbConnectionPool.query(`
        SELECT table_schema, table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name, ordinal_position
      `);
      const schemaInfo = result.toArray();

      // Format schema context
      const tables = new Map<string, string[]>();
      schemaInfo.forEach((row: any) => {
        const key = `${row.table_schema}.${row.table_name}`;
        if (!tables.has(key)) {
          tables.set(key, []);
        }
        tables.get(key)!.push(`${row.column_name} (${row.data_type})`);
      });

      schemaContext = Array.from(tables.entries())
        .map(([table, columns]) => `${table}:\n  ${columns.join('\n  ')}`)
        .join('\n\n');
    } catch (error) {
      console.warn('Failed to get schema context:', error);
    }

    // Build the prompt for the AI
    const systemPrompt = `You are a helpful AI assistant that helps users query and understand their data.
    
Database Schema:
${schemaContext}

Instructions:
- Generate SQL queries to answer user questions about their data
- Always explain what the query does before showing it
- After showing results, provide insights or explanations
- If a query fails, analyze the error and suggest a fix
- Keep responses concise and focused
- Format numbers and dates nicely in explanations
- If results are truncated, mention it
- For follow-up questions, consider previous queries and results in context

When you need to generate a SQL query, respond with:
[EXPLANATION]
Brief explanation of what the query will do

[SQL]
The SQL query

Do not use any other format markers.`;

    // Build conversation context
    let conversationContext = '';
    contextMessages.forEach(msg => {
      if (msg.role === 'user') {
        conversationContext += `User: ${msg.content}\n\n`;
      } else {
        conversationContext += `Assistant: ${msg.content}\n`;
        if (msg.query) {
          conversationContext += `\nSQL Query:\n${msg.query.sql}\n`;
          if (msg.query.error) {
            conversationContext += `Error: ${msg.query.error}\n`;
          } else if (msg.query.results) {
            conversationContext += `Results: ${msg.query.results.rowCount} rows${msg.query.results.truncated ? ' (truncated)' : ''}\n`;
          }
        }
        conversationContext += '\n';
      }
    });

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

    // Parse response to extract SQL
    // For re-runs, extract SQL directly from the message
    if (isRerun) {
      const sqlCodeBlockMatch = userMessage.match(/```sql\n([\s\S]*?)\n```/);
      if (sqlCodeBlockMatch && sqlCodeBlockMatch[1]) {
        const sql = sqlCodeBlockMatch[1].trim();

        // Add AI message confirming re-run
        const aiMessage = aiChatController.addMessage(conversationId, {
          role: 'assistant',
          content: 'Re-running the query...',
          timestamp: new Date(),
        });

        if (!aiMessage) {
          throw new Error('Failed to add AI message');
        }

        // Execute the query
        const queryResult = await executeQuery(sql);

        // Update the message with query results
        aiChatController.updateMessage(conversationId, aiMessage.id, {
          content: queryResult.successful ? 'Query executed successfully.' : 'Query execution failed.',
          query: queryResult,
        });

        return;
      }
    }

    const sqlMatch = content.match(/\[SQL\]\s*\n([\s\S]*?)(?:\n\n|\n\[|$)/);
    const explanationMatch = content.match(/\[EXPLANATION\]\s*\n([\s\S]*?)(?:\n\[SQL\]|$)/);

    if (sqlMatch && sqlMatch[1]) {
      const sql = sqlMatch[1].trim();
      const explanation = explanationMatch ? explanationMatch[1].trim() : content.split('[SQL]')[0].trim();

      // Check if SQL contains DDL statements
      const classifiedStatements = classifySQLStatements([sql]);
      const hasDDL = classifiedStatements.some((s) => s.sqlType === SQLStatementType.DDL);

      if (hasDDL) {
        // Add AI message with explanation and SQL query object (without executing)
        const aiMessage = aiChatController.addMessage(conversationId, {
          role: 'assistant',
          content: explanation + '\n\n⚠️ This query contains DDL statements (CREATE, ALTER, DROP, etc.) and was not executed automatically. You can run it manually using the button below.',
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

        // Update the message with query results
        aiChatController.updateMessage(conversationId, aiMessage.id, {
          query: queryResult,
        });
      }
    } else {
      // No SQL found, just add the response as a message
      aiChatController.addMessage(conversationId, {
        role: 'assistant',
        content,
        timestamp: new Date(),
      });
    }
  }, [duckDbConnectionPool, executeQuery]);

  return {
    sendMessage,
    executeQuery,
  };
};
