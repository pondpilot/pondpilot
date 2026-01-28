import { StructuredSQLResponse } from './structured-ai-response';
import { PROVIDER_IDS, POLLY_CONFIG } from '../constants/ai';

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
    id: PROVIDER_IDS.POLLY,
    name: POLLY_CONFIG.DISPLAY_NAME,
    models: [
      {
        id: 'polly',
        name: 'Polly',
        description:
          "PondPilot's built-in AI assistant. Limited usage - add your own API key for production.",
      },
    ],
  },
  {
    id: PROVIDER_IDS.OPENAI,
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
        description: 'Previous generation, cost-effecient reasoning model for SQL tasks',
        reasoning: true,
      },
    ],
  },
  {
    id: PROVIDER_IDS.ANTHROPIC,
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
    id: PROVIDER_IDS.CUSTOM,
    name: 'Custom Endpoint',
    models: [],
  },
];

export const DEFAULT_AI_CONFIG: AIServiceConfig = {
  provider: PROVIDER_IDS.POLLY,
  model: 'polly',
  apiKey: '',
  apiKeys: {},
  reasoning: false,
};

/**
 * Check if a provider is the built-in Polly AI (no API key required)
 */
export function isPollyProvider(providerId: string): boolean {
  return providerId === PROVIDER_IDS.POLLY;
}

/**
 * Get the display name for a provider ID
 */
export function getProviderDisplayName(providerId: string): string {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId);
  return provider?.name || providerId;
}

/**
 * Get the proxy URL for Polly AI from environment or default
 */
export function getPollyProxyUrl(): string {
  return import.meta.env.VITE_POLLY_PROXY_URL || 'https://ai-proxy.pondpilot.io';
}
