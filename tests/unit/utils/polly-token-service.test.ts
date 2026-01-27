import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getDemoToken, clearDemoToken } from '@utils/polly-token-service';

// Mock the ai-service module (hoisted by Jest)
jest.mock('@models/ai-service', () => ({
  getPollyProxyUrl: () => 'https://test-proxy.example.com',
}));

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('polly-token-service', () => {
  const SESSION_STORAGE_KEY = 'polly_demo_token';

  // Helper to create a valid token response
  const createTokenResponse = (expiresInMinutes = 60) => ({
    token: 'test-token-123',
    expires_at: new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString(),
    user_id: 'test-user',
    user_type: 'demo',
    limits: {
      requests_per_hour: 100,
    },
  });

  // Helper to create a cached token for sessionStorage
  const createCachedToken = (expiresInMinutes = 60) => ({
    token: 'cached-token-456',
    expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString(),
    userId: 'cached-user',
    limits: {
      requestsPerHour: 100,
    },
  });

  beforeEach(() => {
    // Clear all state between tests
    clearDemoToken();
    sessionStorage.clear();
    mockFetch.mockReset();
  });

  describe('getDemoToken', () => {
    it('should fetch a new token when no cache exists', async () => {
      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      const token = await getDemoToken();

      expect(token).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-proxy.example.com/auth/demo-token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should return cached token from memory on subsequent calls', async () => {
      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      // First call - fetches from API
      const token1 = await getDemoToken();
      // Second call - should use memory cache
      const token2 = await getDemoToken();

      expect(token1).toBe('test-token-123');
      expect(token2).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return token from sessionStorage when memory cache is empty', async () => {
      // Pre-populate sessionStorage with a valid token
      const cachedToken = createCachedToken();
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(cachedToken));

      const token = await getDemoToken();

      expect(token).toBe('cached-token-456');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch new token when cached token is expired', async () => {
      // Pre-populate sessionStorage with an expired token (expired 1 minute ago)
      const expiredToken = createCachedToken(-1);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(expiredToken));

      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      const token = await getDemoToken();

      expect(token).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fetch new token when cached token is within expiry buffer (5 min)', async () => {
      // Token expires in 4 minutes - within 5 minute buffer, so should be treated as expired
      const almostExpiredToken = createCachedToken(4);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(almostExpiredToken));

      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      const token = await getDemoToken();

      expect(token).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use cached token when expiry is beyond buffer', async () => {
      // Token expires in 10 minutes - beyond 5 minute buffer, so should be valid
      const validToken = createCachedToken(10);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(validToken));

      const token = await getDemoToken();

      expect(token).toBe('cached-token-456');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should deduplicate concurrent fetch requests (race condition fix)', async () => {
      const tokenResponse = createTokenResponse();

      // Create a delayed response to simulate network latency
      let resolvePromise: (value: Response) => void;
      const delayedResponse = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(delayedResponse);

      // Start multiple concurrent requests
      const promise1 = getDemoToken();
      const promise2 = getDemoToken();
      const promise3 = getDemoToken();

      // Resolve the fetch
      resolvePromise!({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      // All promises should resolve to the same token
      const [token1, token2, token3] = await Promise.all([promise1, promise2, promise3]);

      expect(token1).toBe('test-token-123');
      expect(token2).toBe('test-token-123');
      expect(token3).toBe('test-token-123');

      // Only one fetch should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      } as Response);

      await expect(getDemoToken()).rejects.toThrow('Internal server error');
    });

    it('should throw error with status when no error message in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);

      await expect(getDemoToken()).rejects.toThrow('Failed to get demo token: 503');
    });

    it('should handle JSON parse error gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as unknown as Response);

      await expect(getDemoToken()).rejects.toThrow('Unknown error');
    });

    it('should save fetched token to sessionStorage', async () => {
      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      await getDemoToken();

      const storedToken = sessionStorage.getItem(SESSION_STORAGE_KEY);
      expect(storedToken).not.toBeNull();

      const parsed = JSON.parse(storedToken!);
      expect(parsed.token).toBe('test-token-123');
    });

    it('should include fingerprint in request body', async () => {
      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      await getDemoToken();

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);

      expect(requestBody).toHaveProperty('fingerprint');
      expect(typeof requestBody.fingerprint).toBe('string');
      expect(requestBody.fingerprint.length).toBeGreaterThan(0);
    });
  });

  describe('clearDemoToken', () => {
    it('should clear memory cache', async () => {
      // First, populate the cache
      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      await getDemoToken();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear the cache
      clearDemoToken();

      // Set up new fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTokenResponse(),
      } as Response);

      // Next call should fetch again
      await getDemoToken();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should clear sessionStorage', async () => {
      // Pre-populate sessionStorage
      const cachedToken = createCachedToken();
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(cachedToken));

      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

      clearDemoToken();

      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });
  });

  describe('fingerprint generation', () => {
    it('should generate deterministic fingerprint for same browser properties', async () => {
      const tokenResponse = createTokenResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => tokenResponse,
      } as Response);

      // First request
      await getDemoToken();
      const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

      // Clear and make second request
      clearDemoToken();
      await getDemoToken();
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);

      // Fingerprints should be identical
      expect(firstCallBody.fingerprint).toBe(secondCallBody.fingerprint);
    });
  });
});
