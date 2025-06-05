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
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Most capable model, best for complex SQL tasks',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Faster and more cost-effective option',
      },
      {
        id: 'o3-mini',
        name: 'O3 Mini',
        description: 'OpenAI O3 Mini model',
      },
      {
        id: '04-mini',
        name: '04 Mini',
        description: 'OpenAI 04 Mini model',
      },
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        description: 'OpenAI GPT-4.1 model',
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        description: 'OpenAI GPT-4.1 Mini model',
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
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  apiKeys: {},
};
