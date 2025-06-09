import { aiChatController } from '@controllers/ai-chat';
import { saveAIChatConversations } from '@controllers/ai-chat/persist';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ChatConversationId, ChatMessageQuery, QueryResults } from '@models/ai-chat';
import { getAIConfig } from '@utils/ai-config';
import { getAIService } from '@utils/ai-service';
import { classifySQLStatements, SQLStatementType } from '@utils/editor/sql';
import { useCallback } from 'react';

const MAX_RESULT_ROWS = 100;
const AI_MODEL_CONTEXT_LIMIT = 8000; // Conservative limit for context management
const MAX_CONTEXT_ROWS = 10; // Maximum rows to include in AI context
const MAX_CONTEXT_CHARS_PER_CELL = 100; // Maximum characters per cell in context

// Custom replacer for JSON.stringify to handle BigInts
const bigIntReplacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

// Helper function to format query results for AI context
const formatResultsForContext = (results: QueryResults): string => {
  const { columns, rows, rowCount, truncated } = results;

  // Sample rows if there are too many
  let sampledRows = rows;
  let sampleInfo = '';

  if (rows.length > MAX_CONTEXT_ROWS) {
    // Take first 5 and last 5 rows
    const firstRows = rows.slice(0, Math.ceil(MAX_CONTEXT_ROWS / 2));
    const lastRows = rows.slice(-Math.floor(MAX_CONTEXT_ROWS / 2));
    sampledRows = [...firstRows, ...lastRows];
    sampleInfo = ` (showing ${sampledRows.length} of ${rowCount} rows - first ${firstRows.length} and last ${lastRows.length} rows)`;
  }

  // Truncate long cell values and handle BigInt
  const truncatedData = sampledRows.map(row =>
    row.map(cell => {
      if (cell === null) return null;

      // Convert BigInt to string before any string operations
      let processedCell = cell;
      if (typeof cell === 'bigint') {
        processedCell = cell.toString();
      }

      const cellStr = String(processedCell);
      if (cellStr.length > MAX_CONTEXT_CHARS_PER_CELL) {
        return `${cellStr.substring(0, MAX_CONTEXT_CHARS_PER_CELL - 3)}...`;
      }
      return processedCell;
    })
  );

  // Create JSON representation (BigInt already handled in truncatedData)
  const dataJson = truncatedData.map(row => {
    const obj: Record<string, any> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });

  return JSON.stringify({
    columns,
    rowCount,
    truncated: truncated || rows.length > MAX_CONTEXT_ROWS,
    sampleInfo: sampleInfo || (truncated ? ' (truncated to 100 rows)' : ''),
    data: dataJson,
  }, bigIntReplacer, 2);
};

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
- After showing results, provide insights or explanations based on the actual data
- Query results are provided in JSON format with columns, row count, and sampled data
- If results show a sample (first and last rows), acknowledge this in your analysis
- If a query fails, analyze the error details and suggest a specific fix
- Keep responses concise and focused
- Format numbers and dates nicely in explanations
- When referencing specific data points, use the actual values from the JSON results
- For follow-up questions, use previous queries, results, and errors to provide better assistance

When you need to generate a SQL query, respond with:
[EXPLANATION]
Brief explanation of what the query will do

[SQL]
The SQL query

Do not use any other format markers.`;

    // Build conversation context with full query results
    let conversationContext = '';
    contextMessages.forEach(msg => {
      if (msg.role === 'user') {
        conversationContext += `User: ${msg.content}\n\n`;
      } else {
        conversationContext += `Assistant: ${msg.content}\n`;
        if (msg.query) {
          conversationContext += `\nSQL Query:\n\`\`\`sql\n${msg.query.sql}\n\`\`\`\n`;
          conversationContext += `Execution Time: ${msg.query.executionTime}ms\n`;

          if (msg.query.error) {
            conversationContext += `\nQuery Error:\n\`\`\`json\n${JSON.stringify({
              error: msg.query.error,
              successful: false,
            }, bigIntReplacer, 2)}\n\`\`\`\n`;
          } else if (msg.query.results) {
            conversationContext += `\nQuery Results:\n\`\`\`json\n${formatResultsForContext(msg.query.results)}\n\`\`\`\n`;
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
