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
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        description: 'Smartest model for complex SQL tasks and database optimization',
      },
      {
        id: 'o4-mini',
        name: 'o4-mini',
        description: 'Fast, cost-efficient reasoning model for SQL analysis and optimization',
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        description: 'Affordable model balancing speed and intelligence for SQL queries',
      },
      {
        id: 'gpt-4.1-nano',
        name: 'GPT-4.1 Nano',
        description: 'Fastest, most cost-effective model for simple SQL tasks',
      },
      {
        id: 'o3',
        name: 'o3',
        description: 'Most powerful reasoning model for complex, multi-step SQL problems',
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude 4 Opus',
        description: 'Flagship model, excellent for complex reasoning and SQL tasks',
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude 4 Sonnet',
        description: 'Fast and efficient model for quick SQL assistance. Best for most users.',
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
  model: 'claude-sonnet-4-20250514',
  apiKey: '',
  apiKeys: {},
};
