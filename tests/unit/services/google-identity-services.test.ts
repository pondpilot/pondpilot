import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { requestGoogleAccessToken } from '@services/google-identity-services';

let mockPopup: { closed: boolean; close: jest.Mock };
let originalWindowOpen: typeof window.open;
let originalCrypto: typeof globalThis.crypto;
let originalAddEventListener: typeof window.addEventListener;
let originalRemoveEventListener: typeof window.removeEventListener;
let broadcastChannelInstances: Array<{
  name: string;
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (data: unknown) => void;
  close: jest.Mock;
}>;

beforeEach(() => {
  jest.useFakeTimers();

  mockPopup = { closed: false, close: jest.fn() };
  originalWindowOpen = window.open;
  originalCrypto = globalThis.crypto;
  originalAddEventListener = window.addEventListener;
  originalRemoveEventListener = window.removeEventListener;

  window.open = jest.fn(() => mockPopup as unknown as Window) as unknown as typeof window.open;
  window.addEventListener = jest.fn() as unknown as typeof window.addEventListener;
  window.removeEventListener = jest.fn() as unknown as typeof window.removeEventListener;

  // Mock crypto.randomUUID
  (globalThis as unknown as Record<string, unknown>).crypto = {
    randomUUID: () => 'test-state-uuid',
  };

  broadcastChannelInstances = [];
  (globalThis as unknown as Record<string, unknown>).BroadcastChannel = class MockBC {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    close = jest.fn();

    constructor(name: string) {
      this.name = name;
      broadcastChannelInstances.push(this as unknown as (typeof broadcastChannelInstances)[number]);
    }

    postMessage(_data: unknown) {
      // Not used by the service (only by the callback page)
    }
  };
});

afterEach(() => {
  jest.useRealTimers();
  window.open = originalWindowOpen;
  window.addEventListener = originalAddEventListener;
  window.removeEventListener = originalRemoveEventListener;
  (globalThis as unknown as Record<string, unknown>).crypto = originalCrypto;
  jest.restoreAllMocks();
});

describe('requestGoogleAccessToken', () => {
  it('should reject if client ID is empty', async () => {
    await expect(requestGoogleAccessToken('')).rejects.toThrow(
      'Google OAuth Client ID is required',
    );
  });

  it('should reject if client ID is whitespace-only', async () => {
    await expect(requestGoogleAccessToken('   ')).rejects.toThrow(
      'Google OAuth Client ID is required',
    );
  });

  it('should reject if popup is blocked', async () => {
    window.open = jest.fn(() => null) as unknown as typeof window.open;

    await expect(requestGoogleAccessToken('test-client-id')).rejects.toThrow('Popup blocked');
  });

  it('should open popup with correct URL parameters', () => {
    const clientId = '123456.apps.googleusercontent.com';
    requestGoogleAccessToken(clientId).catch(() => {});

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('google-oauth-callback.html'),
      'google-oauth',
      expect.any(String),
    );

    const url = (window.open as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain(`client_id=${encodeURIComponent(clientId)}`);
    expect(url).toContain('scope=');
    expect(url).toContain('state=test-state-uuid');
  });

  it('should resolve when BroadcastChannel receives a valid token', async () => {
    const clientId = '123456.apps.googleusercontent.com';
    const promise = requestGoogleAccessToken(clientId);

    const bc = broadcastChannelInstances[0];
    expect(bc).toBeDefined();
    expect(bc.name).toBe('pondpilot-google-oauth');

    bc.onmessage!(
      new MessageEvent('message', {
        data: {
          type: 'google-oauth-result',
          state: 'test-state-uuid',
          accessToken: 'ya29.test-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        },
      }),
    );

    const result = await promise;
    expect(result).toEqual({
      accessToken: 'ya29.test-token',
      expiresIn: 3600,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    });
    expect(bc.close).toHaveBeenCalled();
  });

  it('should ignore messages with wrong state', async () => {
    const clientId = 'test-client-id';
    const promise = requestGoogleAccessToken(clientId);

    const bc = broadcastChannelInstances[0];

    bc.onmessage!(
      new MessageEvent('message', {
        data: {
          type: 'google-oauth-result',
          state: 'wrong-state',
          accessToken: 'ya29.wrong',
          expiresIn: 3600,
          scope: '',
        },
      }),
    );

    bc.onmessage!(
      new MessageEvent('message', {
        data: {
          type: 'google-oauth-result',
          state: 'test-state-uuid',
          accessToken: 'ya29.correct',
          expiresIn: 7200,
          scope: '',
        },
      }),
    );

    const result = await promise;
    expect(result.accessToken).toBe('ya29.correct');
  });

  it('should reject when BroadcastChannel receives an error', async () => {
    const promise = requestGoogleAccessToken('test-client-id');

    const bc = broadcastChannelInstances[0];
    bc.onmessage!(
      new MessageEvent('message', {
        data: {
          type: 'google-oauth-error',
          state: 'test-state-uuid',
          error: 'access_denied',
        },
      }),
    );

    await expect(promise).rejects.toThrow('Google auth error: access_denied');
  });

  it('should reject on timeout', async () => {
    const promise = requestGoogleAccessToken('test-client-id');

    // Advance past the 5-minute timeout
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(promise).rejects.toThrow('Google sign-in timed out');
  });
});
