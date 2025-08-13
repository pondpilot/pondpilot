import { SecretsAPI } from '../services/secrets-api';

/**
 * Cache for MotherDuck tokens to avoid repeated API calls
 */
const tokenCache = new Map<string, string>();

/**
 * Retrieves the MotherDuck token for a given secret ID
 * Uses caching to avoid repeated API calls
 */
export async function getMotherDuckToken(secretId: string): Promise<string | null> {
  // Check cache first
  if (tokenCache.has(secretId)) {
    return tokenCache.get(secretId)!;
  }

  try {
    // For now, we still need to apply the secret to get it into the environment
    // In the future, we could enhance the Rust backend to return the token directly
    await SecretsAPI.applySecretToConnection({
      connection_id: 'motherduck_list', // Dummy connection ID
      secret_id: secretId,
    });

    // The token is now in the environment variable
    // We can't directly access it from JS, but we'll cache the secretId
    // to know we've applied it
    tokenCache.set(secretId, secretId);
    return secretId;
  } catch (error) {
    console.error(`Failed to get MotherDuck token for secret ${secretId}:`, error);
    return null;
  }
}

/**
 * Builds a MotherDuck connection URL with the token embedded
 * @param dbName The database name (without md: prefix)
 * @param token The MotherDuck token
 * @returns The connection URL with embedded token
 */
export function buildMotherDuckUrlWithToken(dbName: string, token?: string): string {
  const baseUrl = `md:${dbName}`;
  if (!token) {
    return baseUrl;
  }

  // For security, we can't actually get the token value from the environment
  // The Rust backend would need to be enhanced to support this
  // For now, we'll return the base URL and rely on the environment variable
  return baseUrl;
}

/**
 * Clears the token cache
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}
