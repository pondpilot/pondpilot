/// <reference path="../types/google-identity-services.d.ts" />

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

const GOOGLE_SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly';

/** Deduplication guard: set once the first load starts. */
let loadPromise: Promise<void> | null = null;

/**
 * Dynamically load the Google Identity Services script.
 * Idempotent — if already loaded or loading, returns the existing promise.
 */
export function loadGISScript(): Promise<void> {
  if (loadPromise) return loadPromise;

  // Script may already be present (e.g., inserted by another integration)
  if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null; // Allow retry on failure
      reject(new Error('Failed to load Google Identity Services script'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export interface GoogleAccessTokenResult {
  accessToken: string;
  expiresIn: number;
  scope: string;
}

/**
 * Request a Google access token via the GIS popup flow.
 *
 * Loads the GIS script if not yet loaded, then opens the Google consent popup.
 * Must be called from a user gesture (click handler) to avoid popup blockers.
 */
export async function requestGoogleAccessToken(
  clientId: string,
): Promise<GoogleAccessTokenResult> {
  if (!clientId.trim()) {
    throw new Error('Google OAuth Client ID is required. Configure it in Settings.');
  }

  await loadGISScript();

  return new Promise<GoogleAccessTokenResult>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SHEETS_READONLY_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Google auth error: ${response.error}`));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresIn: response.expires_in,
          scope: response.scope,
        });
      },
      error_callback: (error) => {
        // Fires when the popup is closed or a non-OAuth error occurs
        reject(
          new Error(error.message || 'Google sign-in was cancelled or failed'),
        );
      },
    });

    tokenClient.requestAccessToken();
  });
}

/**
 * Reset the GIS script loader state. Intended for testing only.
 */
export function _resetGISLoader(): void {
  loadPromise = null;
}
