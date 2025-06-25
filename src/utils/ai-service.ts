import { AIRequest, AIResponse, AIServiceConfig } from '../models/ai-service';
import { SQL_ASSISTANT_FUNCTION, StructuredSQLResponse } from '../models/structured-ai-response';

export type { AIServiceConfig } from '../models/ai-service';

export class AIService {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  updateConfig(config: AIServiceConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiKey) {
      return {
        success: false,
        message: 'API key is required',
      };
    }

    try {
      // Send a minimal test request
      const testRequest: AIRequest = {
        prompt: 'Say "Connection successful"',
        useStructuredResponse: false,
      };

      const response = await this.generateSQLAssistance(testRequest);

      if (response.success) {
        return {
          success: true,
          message: `Connected to ${this.config.provider === 'custom' ? 'custom endpoint' : this.config.provider} successfully`,
        };
      }
      return {
        success: false,
        message: response.error || 'Connection failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async generateSQLAssistance(request: AIRequest): Promise<AIResponse> {
    if (!this.config.apiKey) {
      return {
        success: false,
        error: 'API key not configured. Please set your API key in Settings.',
      };
    }

    if (this.config.provider === 'openai') {
      return this.callOpenAICompatible(request, {
        baseUrl: 'https://api.openai.com/v1',
        authHeader: `Bearer ${this.config.apiKey}`,
        providerName: 'OpenAI',
      });
    }

    if (this.config.provider === 'anthropic') {
      return this.callOpenAICompatible(request, {
        baseUrl: 'https://api.anthropic.com/v1',
        authHeader: `x-api-key ${this.config.apiKey}`,
        providerName: 'Anthropic',
      });
    }

    if (this.config.provider === 'custom') {
      if (!this.config.customEndpoint) {
        return {
          success: false,
          error: 'Custom endpoint URL not configured',
        };
      }

      const authHeader =
        this.config.customAuthType === 'x-api-key'
          ? `x-api-key ${this.config.apiKey}`
          : `Bearer ${this.config.apiKey}`;

      return this.callOpenAICompatible(request, {
        baseUrl: this.config.customEndpoint,
        authHeader,
        providerName: 'Custom Endpoint',
      });
    }

    return {
      success: false,
      error: 'Unsupported AI provider',
    };
  }

  private async callOpenAICompatible(
    request: AIRequest,
    config: {
      baseUrl: string;
      authHeader: string;
      providerName: string;
    },
  ): Promise<AIResponse> {
    try {
      const isErrorFixing = !!request.queryError;
      const systemPrompt = request.useStructuredResponse
        ? `You are a SQL expert assistant. Analyze the user's request and provide structured assistance using the provided function. Focus on DuckDB SQL syntax and provide actionable, specific help.

Key principles:
1. Always provide working SQL code
2. Be specific about what changes you're making and why
3. Consider performance implications
4. Suggest alternatives when appropriate
5. Include helpful explanations for learning
6. IMPORTANT: The user may use @table_name notation to reference tables (e.g., @customers). This is just their way of referring to tables - in your SQL code, use the actual table names WITHOUT the @ symbol${isErrorFixing ? '\n7. When fixing errors, provide the corrected ENTIRE script using the "fix_error" action type' : ''}`
        : `You are a SQL expert assistant. Help users with their SQL queries, providing clear, accurate, and efficient solutions.

Rules:
1. Always provide working SQL code
2. Explain your reasoning briefly
3. If the user's SQL has issues, suggest improvements
4. Focus on DuckDB SQL syntax when relevant
5. Be concise but helpful
6. IMPORTANT: The user may use @table_name notation to reference tables (e.g., @customers). This is just their way of referring to tables - in your SQL code, use the actual table names WITHOUT the @ symbol${isErrorFixing ? '\n7. When fixing errors, provide the complete corrected script' : ''}`;

      let userPrompt = request.prompt;

      // Process mentions in the prompt to make them clearer for the AI
      // Replace @table_name with "the table_name table" to avoid confusion
      userPrompt = userPrompt.replace(/@(\w+)/g, (match, tableName) => {
        // Check if it's likely a table/database reference (not an email or other @ usage)
        if (tableName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
          return `the ${tableName} table`;
        }
        return match; // Keep original if it doesn't look like a table name
      });

      // Add error context if available
      if (request.queryError) {
        userPrompt = `The user encountered an SQL error:
Error Message: ${request.queryError.errorMessage}
${request.queryError.statementType ? `Statement Type: ${request.queryError.statementType}` : ''}

Current Script:
\`\`\`sql
${request.queryError.currentScript}
\`\`\`

${request.prompt}`;
      } else if (request.sqlContext) {
        // Add SQL context if available (and no error context)
        userPrompt = `Here's my current SQL context:
\`\`\`sql
${request.sqlContext}
\`\`\`

${request.prompt}`;
      }

      // Add schema context if available
      if (request.schemaContext) {
        const schemaSection = `\n\n${request.schemaContext}`;
        userPrompt += schemaSection;
      }

      // Build request body based on whether we want structured responses.
      // First build parts common to all model types
      const requestBody: any = {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      };

      // Use correct token parameter based on model type
      if (this.config.reasoning) {
        requestBody.max_completion_tokens = 5000;
      } else {
        requestBody.max_tokens = 5000;
        requestBody.temperature = 0.1;
      }

      // Add function calling for structured responses
      // Check if provider supports tools (custom endpoints may not)
      const supportsTools =
        config.providerName === 'Custom Endpoint'
          ? this.config.customSupportsTools !== false
          : true; // OpenAI and Anthropic always support tools

      if (request.useStructuredResponse && supportsTools) {
        requestBody.tools = [
          {
            type: 'function',
            function: SQL_ASSISTANT_FUNCTION,
          },
        ];
        requestBody.tool_choice = {
          type: 'function',
          function: { name: 'provide_sql_assistance' },
        };
      }

      // Build headers based on provider
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Handle different auth header formats
      if (config.authHeader.startsWith('x-api-key ')) {
        // Anthropic format: "x-api-key value"
        const apiKey = config.authHeader.replace('x-api-key ', '');
        headers['x-api-key'] = apiKey;
        // Add special header to bypass CORS for Anthropic
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
      } else {
        // OpenAI format: "Bearer value"
        headers.Authorization = config.authHeader;
      }

      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      try {
        // Ensure we don't have double slashes by removing trailing slash from baseUrl
        const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        return await this.handleResponse(response, config, request);
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return {
            success: false,
            error: `Request timeout: ${config.providerName} took too long to respond`,
          };
        }

        throw fetchError;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async handleResponse(
    response: Response,
    config: { baseUrl: string; authHeader: string; providerName: string },
    request: AIRequest,
  ): Promise<AIResponse> {
    try {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Provide more specific error messages based on status code
        let errorMessage = errorData.error?.message;

        if (!errorMessage) {
          switch (response.status) {
            case 401:
              errorMessage = 'Invalid API key or unauthorized access';
              break;
            case 403:
              errorMessage = 'Access forbidden - check your API key permissions';
              break;
            case 429:
              errorMessage = 'Rate limit exceeded - please wait before trying again';
              break;
            case 500:
              errorMessage = `${config.providerName} server error - please try again later`;
              break;
            case 502:
            case 503:
            case 504:
              errorMessage = `${config.providerName} service temporarily unavailable`;
              break;
            default:
              errorMessage = `${config.providerName} API error: ${response.status}`;
          }
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice) {
        return {
          success: false,
          error: `No response received from ${config.providerName}`,
        };
      }

      // Handle structured response
      if (request.useStructuredResponse && choice.message?.tool_calls) {
        try {
          const toolCall = choice.message.tool_calls[0];
          if (toolCall.type === 'function' && toolCall.function.name === 'provide_sql_assistance') {
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const structuredResponse: StructuredSQLResponse = functionArgs;

            return {
              success: true,
              structuredResponse,
            };
          }
        } catch (parseError) {
          return {
            success: false,
            error: 'Failed to parse structured response from AI',
          };
        }
      }

      // Handle regular text response
      const content = choice.message?.content;
      if (!content) {
        return {
          success: false,
          error: `No response content received from ${config.providerName}`,
        };
      }

      return {
        success: true,
        content: content.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

// Global AI service instance
let aiServiceInstance: AIService | null = null;

export function getAIService(config: AIServiceConfig): AIService {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIService(config);
  } else {
    aiServiceInstance.updateConfig(config);
  }
  return aiServiceInstance;
}
