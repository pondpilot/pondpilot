import { AIServiceConfig, DEFAULT_AI_CONFIG, AI_PROVIDERS } from '@models/ai-service';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';

import { getJSONCookie, setJSONCookie } from './cookies';

function sanitizeConfig(config: Partial<AIServiceConfig>): Partial<AIServiceConfig> {
  const sanitized: Partial<AIServiceConfig> = {};

  if (typeof config.provider === 'string') {
    sanitized.provider = config.provider.trim();
  }

  if (typeof config.model === 'string') {
    sanitized.model = config.model.trim();
  }

  if (typeof config.apiKey === 'string') {
    // Basic sanitization - remove any obvious injection attempts
    sanitized.apiKey = config.apiKey.trim().replace(/[<>]/g, '');
  }

  if (config.apiKeys && typeof config.apiKeys === 'object') {
    sanitized.apiKeys = {};
    Object.entries(config.apiKeys).forEach(([provider, key]) => {
      if (typeof key === 'string') {
        sanitized.apiKeys![provider] = key.trim().replace(/[<>]/g, '');
      }
    });
  }

  if (typeof config.customEndpoint === 'string') {
    // Validate and sanitize custom endpoint URL
    const endpoint = config.customEndpoint.trim();
    try {
      const url = new URL(endpoint);
      // Ensure it's HTTP(S)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        sanitized.customEndpoint = url.toString();
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  if (config.customAuthType === 'bearer' || config.customAuthType === 'x-api-key') {
    sanitized.customAuthType = config.customAuthType;
  }

  if (config.customModels && Array.isArray(config.customModels)) {
    sanitized.customModels = config.customModels
      .filter((model) => model && typeof model.id === 'string' && typeof model.name === 'string')
      .map((model) => ({
        id: model.id.trim(),
        name: model.name.trim(),
        description: model.description?.trim(),
      }));
  }

  if (typeof config.customSupportsTools === 'boolean') {
    sanitized.customSupportsTools = config.customSupportsTools;
  }

  if (typeof config.reasoning === 'boolean') {
    sanitized.reasoning = config.reasoning;
  }

  return sanitized;
}

export function getAIConfig(): AIServiceConfig {
  try {
    const stored = getJSONCookie<Partial<AIServiceConfig>>(LOCAL_STORAGE_KEYS.AI_SERVICE_CONFIG);
    if (stored) {
      const sanitized = sanitizeConfig(stored);
      const config = { ...DEFAULT_AI_CONFIG, ...sanitized };
      return normalizeConfig(config);
    }
  } catch (error) {
    console.warn('Failed to load AI config:', error);
  }
  return DEFAULT_AI_CONFIG;
}

/**
 * Normalizes the config to ensure consistency between apiKey and apiKeys
 */
function normalizeConfig(config: AIServiceConfig): AIServiceConfig {
  const normalized = { ...config };

  // Ensure apiKeys object exists
  if (!normalized.apiKeys) {
    normalized.apiKeys = {};
  }

  // If there's a current apiKey but not stored in apiKeys, migrate it
  if (normalized.apiKey && !normalized.apiKeys[normalized.provider]) {
    normalized.apiKeys[normalized.provider] = normalized.apiKey;
  }

  // Set current apiKey based on current provider
  const providerKey = normalized.apiKeys[normalized.provider];
  normalized.apiKey = providerKey || '';

  // Set reasoning flag based on model if not already set
  if (normalized.reasoning === undefined) {
    const provider = AI_PROVIDERS.find((p) => p.id === normalized.provider);
    const model = provider?.models.find((m) => m.id === normalized.model);
    normalized.reasoning = model?.reasoning || false;
  }

  return normalized;
}

export function saveAIConfig(config: AIServiceConfig): void {
  try {
    const sanitized = sanitizeConfig(config);
    const baseConfig = { ...DEFAULT_AI_CONFIG, ...sanitized };
    const configToStore = normalizeConfig(baseConfig);

    setJSONCookie(LOCAL_STORAGE_KEYS.AI_SERVICE_CONFIG, configToStore, {
      secure: window.location.protocol === 'https:',
      sameSite: 'strict',
      maxAge: 777 * 24 * 60 * 60, // 777 days
    });
  } catch (error) {
    console.error('Failed to save AI config to cookies:', error);
    throw new Error('Failed to save AI configuration. Please try again.');
  }
}
