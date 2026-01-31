import { getJSONCookie, setJSONCookie } from './cookies';
import { PROVIDER_IDS } from '../constants/ai';
import {
  AIServiceConfig,
  DEFAULT_AI_CONFIG,
  AI_PROVIDERS,
  isPollyProvider,
} from '../models/ai-service';
import { LOCAL_STORAGE_KEYS } from '../models/local-storage';
import type { SecretId } from '../services/secret-store';

/**
 * Well-known SecretId used for persisting AI API keys in the secret store.
 */
export const AI_API_KEYS_SECRET_ID = 'ai-api-keys' as SecretId;

// Module-level cache for API keys loaded from the secret store.
// Populated by `initAIConfigFromSecretStore()` during app initialization,
// before any sync callers of `getAIConfig()` run.
let cachedApiKeys: Record<string, string> | null = null;

/**
 * Initialize the AI config cache from the encrypted secret store.
 * Must be called during app startup before any `getAIConfig()` calls.
 * Falls back to cookie-based keys if the secret store has no entry yet
 * (first run or migration).
 */
export async function initAIConfigFromSecretStore(
  iDb: import('idb').IDBPDatabase<import('@models/persisted-store').AppIdbSchema>,
): Promise<void> {
  try {
    const { getSecret, putSecret } = await import('../services/secret-store');
    const secret = await getSecret(iDb, AI_API_KEYS_SECRET_ID);

    if (secret) {
      cachedApiKeys = secret.data;
      return;
    }

    // First run or migration: check if there are keys in the cookie
    const cookieConfig = getJSONCookie<Partial<AIServiceConfig>>(
      LOCAL_STORAGE_KEYS.AI_SERVICE_CONFIG,
    );
    if (cookieConfig?.apiKeys && Object.keys(cookieConfig.apiKeys).length > 0) {
      // Migrate cookie keys to secret store
      const keysToMigrate: Record<string, string> = {};
      for (const [provider, key] of Object.entries(cookieConfig.apiKeys)) {
        if (typeof key === 'string' && key.trim()) {
          keysToMigrate[provider] = key.trim();
        }
      }

      if (Object.keys(keysToMigrate).length > 0) {
        await putSecret(iDb, AI_API_KEYS_SECRET_ID, {
          label: 'AI API Keys',
          data: keysToMigrate,
        });
        cachedApiKeys = keysToMigrate;

        // Remove keys from cookie (keep other non-sensitive fields)
        const { apiKey: _key, apiKeys: _keys, ...nonSensitive } = cookieConfig;
        setJSONCookie(LOCAL_STORAGE_KEYS.AI_SERVICE_CONFIG, nonSensitive, {
          secure: window.location.protocol === 'https:',
          sameSite: 'strict',
          maxAge: 777 * 24 * 60 * 60,
        });
      }
    }
  } catch (error) {
    console.warn('Failed to initialize AI config from secret store:', error);
  }
}

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
        // Use the original endpoint to preserve whether it had a trailing slash or not
        // We've validated it's a valid URL, so just use the trimmed original
        sanitized.customEndpoint = endpoint;
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

      // Overlay API keys from the encrypted secret store cache
      if (cachedApiKeys) {
        config.apiKeys = { ...config.apiKeys, ...cachedApiKeys };
      }

      return normalizeConfig(config);
    }
  } catch (error) {
    console.warn('Failed to load AI config:', error);
  }

  // Even with no cookie, overlay cached keys
  if (cachedApiKeys) {
    const config = { ...DEFAULT_AI_CONFIG, apiKeys: { ...cachedApiKeys } };
    return normalizeConfig(config);
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

    // Update the module cache with the new keys
    if (configToStore.apiKeys) {
      cachedApiKeys = { ...cachedApiKeys, ...configToStore.apiKeys };
    }

    // Persist API keys to the secret store asynchronously
    if (configToStore.apiKeys && Object.keys(configToStore.apiKeys).length > 0) {
      // Fire-and-forget: persist to encrypted store
      persistApiKeysToSecretStore(configToStore.apiKeys).catch((error) => {
        console.warn('Failed to persist AI API keys to secret store:', error);
      });
    }

    // Save non-sensitive config to cookie (strip API keys)
    const { apiKey: _key, apiKeys: _keys, ...nonSensitive } = configToStore;
    setJSONCookie(LOCAL_STORAGE_KEYS.AI_SERVICE_CONFIG, nonSensitive, {
      secure: window.location.protocol === 'https:',
      sameSite: 'strict',
      maxAge: 777 * 24 * 60 * 60, // 777 days
    });
  } catch (error) {
    console.error('Failed to save AI config to cookies:', error);
    throw new Error('Failed to save AI configuration. Please try again.');
  }
}

async function persistApiKeysToSecretStore(
  apiKeys: Record<string, string>,
): Promise<void> {
  const { useAppStore } = await import('@store/app-store');
  const { _iDbConn } = useAppStore.getState();
  if (!_iDbConn) {
    console.warn('persistApiKeysToSecretStore: IDB connection not available, keys not persisted');
    return;
  }

  const { putSecret } = await import('../services/secret-store');
  await putSecret(_iDbConn, AI_API_KEYS_SECRET_ID, {
    label: 'AI API Keys',
    data: apiKeys,
  });
}

/**
 * Check if a provider is configured and ready to use
 * Polly AI is always available (no API key required)
 */
export function isProviderConfigured(providerId: string, config: AIServiceConfig): boolean {
  // Polly AI is always available
  if (isPollyProvider(providerId)) {
    return true;
  }

  // Custom provider needs both endpoint and API key
  if (providerId === PROVIDER_IDS.CUSTOM) {
    return Boolean(config.apiKeys?.[providerId]) && Boolean(config.customEndpoint);
  }

  // Other providers just need an API key
  return Boolean(config.apiKeys?.[providerId]?.trim());
}

/**
 * Get list of configured provider IDs
 */
export function getConfiguredProviders(config: AIServiceConfig): string[] {
  return AI_PROVIDERS.filter((p) => isProviderConfigured(p.id, config)).map((p) => p.id);
}
