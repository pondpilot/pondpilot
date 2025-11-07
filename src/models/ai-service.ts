import { StructuredSQLResponse } from './structured-ai-response';

export interface AIProvider {
  id: string;
  name: string;
  models: AIModel[];
}

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  reasoning?: boolean;
}

export interface AIServiceConfig {
  provider: string;
  model: string;
  apiKey: string;
  apiKeys?: Record<string, string>;
  customEndpoint?: string;
  customAuthType?: 'bearer' | 'x-api-key';
  customModels?: AIModel[];
  customSupportsTools?: boolean;
  reasoning?: boolean;
}

export interface AIRequest {
  prompt: string;
  sqlContext?: string;
  schemaContext?: string;
  useStructuredResponse?: boolean;
  queryError?: {
    errorMessage: string;
    statementType?: string;
    currentScript: string;
  };
  cursorContext?: {
    isOnEmptyLine: boolean;
    hasExistingQuery: boolean;
  };
}

export interface AIResponse {
  success: boolean;
  content?: string;
  structuredResponse?: StructuredSQLResponse;
  error?: string;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      {
        id: 'gpt-5',
        name: 'GPT-5',
        description: 'Flagship reasoning model for complex logical and technical SQL tasks',
        reasoning: true,
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        description: 'Faster and affordable reasoning model with great balance',
        reasoning: true,
      },
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        description: 'Smartest non-reasoning model for complex SQL tasks and database optimization',
      },
      {
        id: 'o4-mini',
        name: 'o4-mini',
        description: 'Fast, cost-efficient reasoning model for SQL analysis and optimization',
        reasoning: true,
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        description: 'Affordable model balancing speed and intelligence for SQL queries',
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        description: 'Previous generation, cost-efficient reasoning model for SQL tasks',
        reasoning: true,
      },
      {
        id: 'gpt-5-nano',
        name: 'GPT-5 Nano',
        description: 'Fastest and most affordable reasoning model for summarization and classification',
        reasoning: true,
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude 4.5 Sonnet',
        description: 'Best coding model in the world, strongest for building complex agents',
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude 4.5 Haiku',
        description: 'Fast and cost-efficient, optimized for low latency tasks',
      },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Endpoint',
    models: [],
  },
];

export const DEFAULT_AI_CONFIG: AIServiceConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  apiKey: '',
  apiKeys: {},
  reasoning: false,
};
