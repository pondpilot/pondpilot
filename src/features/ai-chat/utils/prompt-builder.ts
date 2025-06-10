import { ChatMessage } from '@models/ai-chat';

import { bigIntReplacer, formatResultsForContext } from './json-helpers';

export function buildSystemPrompt(schemaContext: string): string {
  return `You are a helpful AI assistant that helps users query and understand their data.
    
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
}

export function buildConversationContext(messages: ChatMessage[]): string {
  let conversationContext = '';

  messages.forEach(msg => {
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

  return conversationContext;
}

export interface ParsedAIResponse {
  sql?: string;
  explanation?: string;
  content: string;
}

export function parseAIResponse(content: string): ParsedAIResponse {
  const sqlMatch = content.match(/\[SQL\]\s*\n([\s\S]*?)(?:\n\n|\n\[|$)/);
  const explanationMatch = content.match(/\[EXPLANATION\]\s*\n([\s\S]*?)(?:\n\[SQL\]|$)/);

  if (sqlMatch && sqlMatch[1]) {
    const sql = sqlMatch[1].trim();
    const explanation = explanationMatch ? explanationMatch[1].trim() : content.split('[SQL]')[0].trim();

    return {
      sql,
      explanation,
      content,
    };
  }

  return { content };
}
