import { sanitizeErrorMessage } from './error-sanitizer';
import { POLLY_CONFIG, PROVIDER_IDS, AI_SERVICE_CONFIG } from '../constants/ai';
import {
  AIRequest,
  AIResponse,
  AIServiceConfig,
  isPollyProvider,
  getPollyProxyUrl,
  getProviderDisplayName,
} from '../models/ai-service';
import { SQL_ASSISTANT_FUNCTION, StructuredSQLResponse } from '../models/structured-ai-response';

export type { AIServiceConfig } from '../models/ai-service';

// Re-export for use elsewhere
export { sanitizeErrorMessage } from './error-sanitizer';

/**
 * Typed request body for OpenAI-compatible chat completion requests.
 * Used by both Polly AI proxy and external providers.
 */
interface ChatCompletionRequestBody {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  tools?: Array<{
    type: 'function';
    function: typeof SQL_ASSISTANT_FUNCTION;
  }>;
  tool_choice?: {
    type: 'function';
    function: { name: string };
  };
}

export class AIService {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  updateConfig(config: AIServiceConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    // Polly AI doesn't require an API key
    if (!isPollyProvider(this.config.provider) && !this.config.apiKey) {
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
          message: `Connected to ${getProviderDisplayName(this.config.provider)} successfully`,
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

  async generateSQLAssistance(request: AIRequest, signal?: AbortSignal): Promise<AIResponse> {
    // Polly AI doesn't require an API key
    if (!isPollyProvider(this.config.provider) && !this.config.apiKey) {
      return {
        success: false,
        error: 'API key not configured. Please set your API key in Settings.',
      };
    }

    // Handle Polly AI (built-in proxy)
    if (isPollyProvider(this.config.provider)) {
      return this.callPollyProxy(request, signal);
    }

    if (this.config.provider === PROVIDER_IDS.OPENAI) {
      return this.callOpenAICompatible(request, {
        baseUrl: 'https://api.openai.com/v1',
        authHeader: `Bearer ${this.config.apiKey}`,
        providerName: 'OpenAI',
      }, signal);
    }

    if (this.config.provider === PROVIDER_IDS.ANTHROPIC) {
      return this.callOpenAICompatible(request, {
        baseUrl: 'https://api.anthropic.com/v1',
        authHeader: `x-api-key ${this.config.apiKey}`,
        providerName: 'Anthropic',
      }, signal);
    }

    if (this.config.provider === PROVIDER_IDS.CUSTOM) {
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
      }, signal);
    }

    return {
      success: false,
      error: 'Unsupported AI provider',
    };
  }

  /**
   * Build request body for Polly AI proxy (OpenAI-compatible format)
   */
  private buildPollyRequestBody(request: AIRequest): ChatCompletionRequestBody {
    const isErrorFixing = !!request.queryError;
    const systemPrompt = this.buildSystemPrompt(request, isErrorFixing);
    const userPrompt = this.buildUserPrompt(request);

    const requestBody: ChatCompletionRequestBody = {
      model: POLLY_CONFIG.MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: POLLY_CONFIG.MAX_TOKENS,
      temperature: POLLY_CONFIG.TEMPERATURE,
    };

    if (request.useStructuredResponse) {
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

    return requestBody;
  }

  /**
   * Send request to Polly AI proxy with timeout handling
   */
  private async sendPollyRequest(
    requestBody: ChatCompletionRequestBody,
    signal?: AbortSignal,
  ): Promise<{ response?: Response; error?: AIResponse }> {
    const baseUrl = getPollyProxyUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POLLY_CONFIG.TIMEOUT_MS);

    // Forward external abort signal to the local controller
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return { error: { success: false, cancelled: true } };
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(`${baseUrl}/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return { response };
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        // Distinguish user cancellation from timeout
        if (signal?.aborted) {
          return { error: { success: false, cancelled: true } };
        }
        return {
          error: {
            success: false,
            error: `Request timeout: ${POLLY_CONFIG.DISPLAY_NAME} took too long to respond`,
          },
        };
      }

      throw fetchError;
    }
  }

  /**
   * Call the Polly AI proxy endpoint (public, no authentication required)
   */
  private async callPollyProxy(request: AIRequest, signal?: AbortSignal): Promise<AIResponse> {
    try {
      const requestBody = this.buildPollyRequestBody(request);
      const sendResult = await this.sendPollyRequest(requestBody, signal);

      if (sendResult.error || !sendResult.response) {
        return sendResult.error ?? { success: false, error: 'Failed to send request' };
      }

      return await this.handlePollyResponse(sendResult.response, request);
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error occurred',
      };
    }
  }

  /**
   * Handle response from Polly AI proxy (supports both text and structured responses)
   */
  private async handlePollyResponse(response: Response, request: AIRequest): Promise<AIResponse> {
    try {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.error;

        if (!errorMessage) {
          switch (response.status) {
            case 429:
              errorMessage = 'Demo rate limit reached. Add your own API key for unlimited access.';
              break;
            case 500:
              errorMessage = `${POLLY_CONFIG.DISPLAY_NAME} service error - please try again later`;
              break;
            case 502:
            case 503:
            case 504:
              errorMessage = `${POLLY_CONFIG.DISPLAY_NAME} service temporarily unavailable`;
              break;
            default:
              errorMessage = `${POLLY_CONFIG.DISPLAY_NAME} error: ${response.status}`;
          }
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const data = await response.json();

      // Handle structured response with tool calls (OpenAI-compatible format from proxy)
      if (request.useStructuredResponse && data.choices?.[0]?.message?.tool_calls) {
        try {
          const toolCall = data.choices[0].message.tool_calls[0];
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
            error: `Failed to parse structured response from ${POLLY_CONFIG.DISPLAY_NAME}`,
          };
        }
      }

      // Handle regular text response
      // The proxy returns OpenAI-compatible format: { choices: [{ message: { content: '...' } }] }
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return {
          success: false,
          error: `No response content received from ${POLLY_CONFIG.DISPLAY_NAME}`,
        };
      }

      return {
        success: true,
        content: content.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error occurred',
      };
    }
  }

  /**
   * Build system prompt for AI requests
   */
  private buildSystemPrompt(request: AIRequest, isErrorFixing: boolean): string {
    if (request.useStructuredResponse) {
      return `You are a SQL expert assistant. Analyze the user's request and provide structured assistance using the provided function. Focus on DuckDB SQL syntax and provide actionable, specific help.

Key principles:
1. Always provide working SQL code
2. Be specific about what changes you're making and why
3. Consider performance implications
4. Suggest alternatives when appropriate
5. Include helpful explanations for learning
6. IMPORTANT: The user may use @table_name notation to reference tables (e.g., @customers). This is just their way of referring to tables - in your SQL code, use the actual table names WITHOUT the @ symbol${isErrorFixing ? '\n7. When fixing errors, provide the corrected ENTIRE script using the "fix_error" action type' : ''}

Action Type Selection Guidelines:
- Use "replace_statement" when the user asks to fix, improve, or rewrite an existing query
- Use "insert_after" when the user asks for another query or wants to add additional queries (especially if they already have a complete query)
- Use "insert_before" when the user wants to add setup queries, CTEs, or preparatory statements
- Use "insert_at_cursor" when the context is unclear or when inserting a snippet at a specific location
- Use "add_comment" when the user asks for explanations or documentation
- Use "fix_error" ONLY when fixing SQL errors and you need to replace the entire script

IMPORTANT Cursor Context Heuristic:
${request.cursorContext?.isOnEmptyLine && request.cursorContext?.hasExistingQuery ? '- The user invoked the assistant on an EMPTY LINE with existing queries in the editor. This strongly suggests they want to ADD a new query, not replace existing ones. Prefer "insert_after" or "insert_at_cursor" unless they explicitly ask to modify the existing query.' : ''}
${request.cursorContext?.isOnEmptyLine && !request.cursorContext?.hasExistingQuery ? '- The user invoked the assistant on an empty line in an empty editor. Use "replace_statement" or "insert_at_cursor" as appropriate.' : ''}
${!request.cursorContext?.isOnEmptyLine ? '- The user invoked the assistant within or near an existing statement. Consider the context and their request to decide the appropriate action.' : ''}`;
    }

    return `You are a SQL expert assistant. Help users with their SQL queries, providing clear, accurate, and efficient solutions.

Rules:
1. Always provide working SQL code
2. Explain your reasoning briefly
3. If the user's SQL has issues, suggest improvements
4. Focus on DuckDB SQL syntax when relevant
5. Be concise but helpful
6. IMPORTANT: The user may use @table_name notation to reference tables (e.g., @customers). This is just their way of referring to tables - in your SQL code, use the actual table names WITHOUT the @ symbol${isErrorFixing ? '\n7. When fixing errors, provide the complete corrected script' : ''}`;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(request: AIRequest): string {
    let userPrompt = request.prompt;

    // Process mentions in the prompt
    userPrompt = userPrompt.replace(/@(\w+)/g, (match, tableName) => {
      if (tableName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        return `the ${tableName} table`;
      }
      return match;
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
      userPrompt = `Here's my current SQL context:
\`\`\`sql
${request.sqlContext}
\`\`\`

${request.prompt}`;
    }

    // Add schema context if available
    if (request.schemaContext) {
      userPrompt += `\n\n${request.schemaContext}`;
    }

    return userPrompt;
  }

  private async callOpenAICompatible(
    request: AIRequest,
    providerConfig: {
      baseUrl: string;
      authHeader: string;
      providerName: string;
    },
    signal?: AbortSignal,
  ): Promise<AIResponse> {
    try {
      const isErrorFixing = !!request.queryError;
      const systemPrompt = this.buildSystemPrompt(request, isErrorFixing);
      const userPrompt = this.buildUserPrompt(request);

      // Build request body using the shared type
      const requestBody: ChatCompletionRequestBody = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      };

      // Use correct token parameter based on model type
      if (this.config.reasoning) {
        requestBody.max_completion_tokens = AI_SERVICE_CONFIG.MAX_TOKENS;
      } else {
        requestBody.max_tokens = AI_SERVICE_CONFIG.MAX_TOKENS;
        requestBody.temperature = AI_SERVICE_CONFIG.TEMPERATURE;
      }

      // Add function calling for structured responses
      // Check if provider supports tools (custom endpoints may not)
      const supportsTools =
        providerConfig.providerName === 'Custom Endpoint'
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
      if (providerConfig.authHeader.startsWith('x-api-key ')) {
        // Anthropic format: "x-api-key value"
        const apiKey = providerConfig.authHeader.replace('x-api-key ', '');
        headers['x-api-key'] = apiKey;
        // Add special header to bypass CORS for Anthropic
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
      } else {
        // OpenAI format: "Bearer value"
        headers.Authorization = providerConfig.authHeader;
      }

      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_SERVICE_CONFIG.TIMEOUT_MS);

      // Forward external abort signal to the local controller
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          return { success: false, cancelled: true };
        }
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        // Ensure we don't have double slashes by removing trailing slash from baseUrl
        const baseUrl = providerConfig.baseUrl.endsWith('/')
          ? providerConfig.baseUrl.slice(0, -1)
          : providerConfig.baseUrl;
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        return await this.handleResponse(response, providerConfig, request);
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          // Distinguish user cancellation from timeout
          if (signal?.aborted) {
            return { success: false, cancelled: true };
          }
          return {
            success: false,
            error: `Request timeout: ${providerConfig.providerName} took too long to respond`,
          };
        }

        throw fetchError;
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error occurred',
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
        error:
          error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error occurred',
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
