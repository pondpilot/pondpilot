import { ChatMessage } from '@models/ai-chat';

import { bigIntReplacer, formatResultsForContext } from './json-helpers';

export function buildSystemPrompt(schemaContext: string): string {
  return `You are a helpful AI assistant that helps users query and understand their data.
    
Database Schema:
${schemaContext}

Instructions:
- Generate SQL queries to answer user questions about their data
- Always explain what the query does before showing it
- Keep responses concise and focused
- Format numbers and dates nicely in explanations
- For follow-up questions, use previous queries, results, and errors to provide better assistance
- When users ask for explanations of queries (e.g., "explain @query"), provide a clear explanation without generating new SQL
- For explanation-only requests, respond with just the [EXPLANATION] section without [SQL]

IMPORTANT Database Context Rules:
- When users mention databases, schemas, or tables using @mentions (e.g., @database.schema.table), preserve the FULL qualified names in your SQL queries
- If a user mentions @chinook.main.albums, use "chinook.main.albums" in your SQL, not just "main.albums"
- When comparing tables across databases (e.g., @db1.schema.table vs @db2.schema.table), ensure you use the full database.schema.table notation
- The @mention format indicates the user's explicit intent to reference specific database objects - respect this intent

VISUALIZATION RULES:
- ONLY generate visualizations when the user EXPLICITLY asks for a chart, graph, plot, visualization, or uses similar terms
- Examples of explicit requests: "show me a chart", "plot this data", "create a bar graph", "visualize the trend"
- By default, always return tabular results unless visualization is specifically requested
- Do NOT automatically decide to visualize data based on its type or structure
- Table format is the preferred default output for all queries

Response Format:

For queries and data analysis:
[EXPLANATION]
Brief explanation of what the query will do

[SQL]
The SQL query

For explanation-only requests (e.g., "explain this query", "what does @query do"):
[EXPLANATION]
Detailed explanation of the query or concept

CRITICAL FORMAT RULES:
- NEVER use markdown code blocks (\`\`\`sql, \`\`\`json, etc.) in your response
- NEVER wrap SQL queries in backticks or any other formatting
- Only use the [EXPLANATION] and [SQL] markers as shown above
- Place the raw SQL query directly after the [SQL] marker with no additional formatting
- This is essential for proper query execution - markdown blocks will break the system`;
}

export function buildConversationContext(messages: ChatMessage[]): string {
  let conversationContext = '';

  messages.forEach((msg) => {
    if (msg.role === 'user') {
      conversationContext += `User: ${msg.content}\n\n`;
    } else {
      conversationContext += `Assistant: ${msg.content}\n`;
      if (msg.query) {
        conversationContext += `\nSQL Query:\n\`\`\`sql\n${msg.query.sql}\n\`\`\`\n`;
        conversationContext += `Execution Time: ${msg.query.executionTime}ms\n`;

        if (msg.query.error) {
          conversationContext += `\nQuery Error:\n\`\`\`json\n${JSON.stringify(
            {
              error: msg.query.error,
              successful: false,
            },
            bigIntReplacer,
            2,
          )}\n\`\`\`\n`;
        } else if (msg.query.results) {
          conversationContext += `\nQuery Results:\n\`\`\`json\n${formatResultsForContext(msg.query.results)}\n\`\`\`\n`;
        }
      }
      conversationContext += '\n';
    }
  });

  return conversationContext;
}

export interface ParsedAIResponse {
  sql?: string;
  explanation?: string;
  chartSpec?: any;
  content: string;
}

export function parseAIResponse(content: string): ParsedAIResponse {
  const sqlMatch = content.match(/\[SQL\]\s*\n([\s\S]*?)(?:\n\n|\n\[|$)/);
  const explanationMatch = content.match(/\[EXPLANATION\]\s*\n([\s\S]*?)(?:\n\[SQL\]|\n\[VEGA-LITE\]|$)/);
  const vegaLiteMatch = content.match(/\[VEGA-LITE\]\s*\n([\s\S]*?)(?:\n\n|\n\[|$)/);

  // Check for explanation-only response first
  if (explanationMatch && !sqlMatch) {
    return {
      explanation: explanationMatch[1].trim(),
      content,
    };
  }

  if (sqlMatch && sqlMatch[1]) {
    let sql = sqlMatch[1].trim();

    // Remove markdown code blocks if present (fallback for models that ignore instructions)
    sql = sql.replace(/^```(?:sql)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    const explanation = explanationMatch
      ? explanationMatch[1].trim()
      : content.split('[SQL]')[0].trim();

    let chartSpec;
    if (vegaLiteMatch && vegaLiteMatch[1]) {
      try {
        // Parse the Vega-Lite JSON specification
        chartSpec = JSON.parse(vegaLiteMatch[1].trim());
      } catch (e) {
        // If parsing fails, ignore the chart spec
        console.error('Failed to parse Vega-Lite specification:', e);
      }
    }

    return {
      sql,
      explanation,
      chartSpec,
      content,
    };
  }

  return { content };
}
