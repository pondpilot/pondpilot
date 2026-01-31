/* eslint-disable import/order -- Module-under-test import must come after jest.mock calls for proper mock hoisting */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGetSecret = jest.fn<any>();
const mockPutSecret = jest.fn<any>().mockResolvedValue(undefined);
const mockGetJSONCookie = jest.fn<any>();
const mockSetJSONCookie = jest.fn<any>();

jest.mock('@services/secret-store', () => ({
  getSecret: (...args: unknown[]) => mockGetSecret(...args),
  putSecret: (...args: unknown[]) => mockPutSecret(...args),
}));

jest.mock('@utils/cookies', () => ({
  getJSONCookie: (...args: unknown[]) => mockGetJSONCookie(...args),
  setJSONCookie: (...args: unknown[]) => mockSetJSONCookie(...args),
}));

jest.mock('@models/ai-service', () => ({
  AIServiceConfig: {},
  DEFAULT_AI_CONFIG: {
    provider: '',
    model: '',
    apiKey: '',
    apiKeys: {},
  },
  AI_PROVIDERS: [],
  isPollyProvider: () => false,
}));

jest.mock('../../../src/constants/ai', () => ({
  PROVIDER_IDS: { CUSTOM: 'custom' },
}));

// eslint-disable-next-line import/first
import { initAIConfigFromSecretStore, AI_API_KEYS_SECRET_ID } from '@utils/ai-config';

describe('ai-config', () => {
  const mockIDb = {} as any;

  beforeEach(() => {
    mockGetSecret.mockReset();
    mockPutSecret.mockReset();
    mockGetJSONCookie.mockReset();
    mockSetJSONCookie.mockReset();
  });

  describe('initAIConfigFromSecretStore', () => {
    it('should load keys from secret store when available', async () => {
      mockGetSecret.mockResolvedValue({
        label: 'AI API Keys',
        data: { anthropic: 'sk-ant-test' },
      });

      await initAIConfigFromSecretStore(mockIDb);

      expect(mockGetSecret).toHaveBeenCalledWith(mockIDb, AI_API_KEYS_SECRET_ID);
      // Should not migrate or write when secret store has keys
      expect(mockPutSecret).not.toHaveBeenCalled();
    });

    it('should migrate keys from cookie when secret store is empty', async () => {
      mockGetSecret.mockResolvedValue(null);
      mockGetJSONCookie.mockReturnValue({
        provider: 'anthropic',
        model: 'claude-3',
        apiKeys: { anthropic: 'sk-ant-migrate' },
      });

      await initAIConfigFromSecretStore(mockIDb);

      expect(mockPutSecret).toHaveBeenCalledWith(
        mockIDb,
        AI_API_KEYS_SECRET_ID,
        expect.objectContaining({
          data: { anthropic: 'sk-ant-migrate' },
        }),
      );
      // Cookie should be rewritten without keys
      expect(mockSetJSONCookie).toHaveBeenCalled();
    });

    it('should skip migration when cookie has no API keys', async () => {
      mockGetSecret.mockResolvedValue(null);
      mockGetJSONCookie.mockReturnValue({
        provider: 'anthropic',
        model: 'claude-3',
      });

      await initAIConfigFromSecretStore(mockIDb);

      expect(mockPutSecret).not.toHaveBeenCalled();
      expect(mockSetJSONCookie).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetSecret.mockRejectedValue(new Error('IDB error'));

      // Should not throw
      await expect(initAIConfigFromSecretStore(mockIDb)).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to initialize AI config from secret store:',
        expect.any(Error),
      );
      warnSpy.mockRestore();
    });
  });
});
