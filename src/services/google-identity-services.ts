/**
 * Google OAuth via a same-origin popup relay.
 *
 * COOP `same-origin` (required for SharedArrayBuffer / MotherDuck) prevents
 * cross-origin popups from communicating back to the opener.  Instead of using
 * the Google Identity Services popup, we open a same-origin relay page
 * (`/google-oauth-callback.html`) that redirects to Google OAuth and, on
 * return, sends the token back via BroadcastChannel.
 */

const GOOGLE_SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const CHANNEL_NAME = 'pondpilot-google-oauth';
const POPUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface GoogleAccessTokenResult {
  accessToken: string;
  expiresIn: number;
  scope: string;
}

export function getGoogleOAuthCallbackUrl(): string {
  const appBaseUrl =
    typeof document === 'undefined' ? `${window.location.origin}/` : document.baseURI;
  return new URL('google-oauth-callback.html', appBaseUrl).toString();
}

/**
 * Request a Google access token via a same-origin popup relay.
 *
 * Must be called from a user gesture (click handler) to avoid popup blockers.
 */
export function requestGoogleAccessToken(clientId: string): Promise<GoogleAccessTokenResult> {
  if (!clientId.trim()) {
    return Promise.reject(
      new Error('Google OAuth Client ID is required. Configure it in Settings.'),
    );
  }

  const state = crypto.randomUUID();
  const callbackPath = getGoogleOAuthCallbackUrl();
  const popupUrl = `${callbackPath}?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(GOOGLE_SHEETS_READONLY_SCOPE)}&state=${encodeURIComponent(state)}`;

  const popup = window.open(popupUrl, 'google-oauth', 'width=500,height=600,menubar=no,toolbar=no');
  if (!popup) {
    return Promise.reject(
      new Error('Popup blocked. Please allow popups for this site and try again.'),
    );
  }

  return new Promise<GoogleAccessTokenResult>((resolve, reject) => {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      bc.close();
      clearTimeout(timeoutTimer);
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };

    bc.onmessage = (event: MessageEvent) => {
      const { data } = event;
      if (data?.state !== state) return;

      if (data.type === 'google-oauth-result' && data.accessToken) {
        cleanup();
        resolve({
          accessToken: data.accessToken,
          expiresIn: data.expiresIn,
          scope: data.scope,
        });
      } else if (data.type === 'google-oauth-error') {
        cleanup();
        reject(new Error(`Google auth error: ${data.error || 'unknown'}`));
      }
    };

    // Detect popup closure: when the main window regains focus and keeps it
    // for a few seconds without receiving a token, assume the popup was closed.
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const handleFocus = () => {
      if (settled) return;
      focusTimer = setTimeout(() => {
        if (!settled && popup.closed) {
          cleanup();
          reject(new Error('Google sign-in was cancelled'));
        }
      }, 3000);
    };

    const handleBlur = () => {
      if (focusTimer) {
        clearTimeout(focusTimer);
        focusTimer = null;
      }
    };

    // Delay monitoring focus so the initial popup opening doesn't trigger it
    setTimeout(() => {
      if (!settled) {
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);
      }
    }, 2000);

    // Hard timeout fallback
    const timeoutTimer = setTimeout(() => {
      if (!settled) {
        cleanup();
        try {
          popup.close();
        } catch {
          // Popup may already be closed or cross-origin
        }
        reject(new Error('Google sign-in timed out'));
      }
    }, POPUP_TIMEOUT_MS);
  });
}
