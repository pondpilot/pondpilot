import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  loadGISScript,
  requestGoogleAccessToken,
  _resetGISLoader,
} from '@services/google-identity-services';

// Store references to script callbacks
let lastScript: { src: string; async: boolean; onload: () => void; onerror: () => void } | null =
  null;
let originalDocument: typeof globalThis.document;
let originalGoogle: any;

beforeEach(() => {
  _resetGISLoader();
  lastScript = null;

  // Save originals so we can restore them without side-effects on other test suites
  originalDocument = (global as any).document;
  originalGoogle = (global as any).google;

  // Reset the global google namespace
  (global as any).google = undefined;

  // Mock document.createElement / document.head.appendChild
  (global as any).document = {
    createElement: (tag: string) => {
      if (tag === 'script') {
        const script = { src: '', async: false, onload: () => {}, onerror: () => {} };
        lastScript = script;
        return script;
      }
      return {};
    },
    head: {
      appendChild: () => {},
    },
  };
});

afterEach(() => {
  (global as any).google = originalGoogle;
  (global as any).document = originalDocument;
});

describe('loadGISScript', () => {
  it('should create a script element with the GIS URL', async () => {
    const promise = loadGISScript();
    expect(lastScript).not.toBeNull();
    expect(lastScript!.src).toBe('https://accounts.google.com/gsi/client');
    expect(lastScript!.async).toBe(true);

    // Simulate script load
    lastScript!.onload();
    await promise;
  });

  it('should resolve immediately if GIS is already present', async () => {
    (global as any).google = { accounts: { oauth2: {} } };
    await loadGISScript();
    // No script element should have been created
    expect(lastScript).toBeNull();
  });

  it('should deduplicate concurrent calls', async () => {
    const p1 = loadGISScript();
    const p2 = loadGISScript();

    // Only one script element created
    expect(lastScript).not.toBeNull();
    lastScript!.onload();

    await p1;
    await p2;
  });

  it('should reject when the script fails to load', async () => {
    const promise = loadGISScript();
    lastScript!.onerror();

    await expect(promise).rejects.toThrow('Failed to load Google Identity Services script');
  });

  it('should allow retry after a load failure', async () => {
    const p1 = loadGISScript();
    lastScript!.onerror();
    await expect(p1).rejects.toThrow();

    // Second attempt should create a new script element
    const p2 = loadGISScript();
    expect(lastScript).not.toBeNull();
    lastScript!.onload();
    await p2;
  });
});

describe('requestGoogleAccessToken', () => {
  let mockRequestAccessToken: jest.Mock;

  beforeEach(() => {
    mockRequestAccessToken = jest.fn();

    (global as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => {
            // Store the callback so we can invoke it from tests
            (global as any).__gisCallback = config.callback;
            (global as any).__gisErrorCallback = config.error_callback;
            (global as any).__gisConfig = config;
            return { requestAccessToken: mockRequestAccessToken };
          },
        },
      },
    };
  });

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

  it('should initialize token client with correct params', async () => {
    const clientId = '123456.apps.googleusercontent.com';

    // Make requestAccessToken trigger the stored callback immediately
    mockRequestAccessToken.mockImplementation(() => {
      (global as any).__gisCallback({
        access_token: 'ya29.test-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        token_type: 'Bearer',
      });
    });

    const result = await requestGoogleAccessToken(clientId);

    expect(mockRequestAccessToken).toHaveBeenCalled();
    expect((global as any).__gisConfig.client_id).toBe(clientId);
    expect((global as any).__gisConfig.scope).toBe(
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    );
    expect(result).toEqual({
      accessToken: 'ya29.test-token',
      expiresIn: 3600,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    });
  });

  it('should reject when error_callback fires', async () => {
    mockRequestAccessToken.mockImplementation(() => {
      (global as any).__gisErrorCallback({ type: 'popup_closed', message: 'User closed popup' });
    });

    await expect(requestGoogleAccessToken('test-client-id')).rejects.toThrow('User closed popup');
  });

  it('should reject with default message when error has no message', async () => {
    mockRequestAccessToken.mockImplementation(() => {
      (global as any).__gisErrorCallback({ type: 'unknown' });
    });

    await expect(requestGoogleAccessToken('test-client-id')).rejects.toThrow(
      'Google sign-in was cancelled or failed',
    );
  });
});
