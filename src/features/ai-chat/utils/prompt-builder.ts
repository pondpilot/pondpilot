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

Response Format:
[EXPLANATION]
Brief explanation of what the query will do

[SQL]
The SQL query

Note: After your query is executed, the system will automatically generate appropriate visualizations for the data when applicable (time series, comparisons, distributions, etc.).

Do not use any other format markers besides [EXPLANATION] and [SQL].`;
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
  chartSpec?: any;
  content: string;
}

export function parseAIResponse(content: string): ParsedAIResponse {
  const sqlMatch = content.match(/\[SQL\]\s*\n([\s\S]*?)(?:\n\n|\n\[|$)/);
  const explanationMatch = content.match(/\[EXPLANATION\]\s*\n([\s\S]*?)(?:\n\[SQL\]|$)/);
  const vegaLiteMatch = content.match(/\[VEGA-LITE\]\s*\n([\s\S]*?)(?:\n\n|\n\[|$)/);

  if (sqlMatch && sqlMatch[1]) {
    const sql = sqlMatch[1].trim();
    const explanation = explanationMatch ? explanationMatch[1].trim() : content.split('[SQL]')[0].trim();
    
    let chartSpec = undefined;
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
