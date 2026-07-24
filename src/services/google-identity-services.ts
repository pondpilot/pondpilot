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
const POPUP_POLL_INTERVAL_MS = 250;
let oauthRequestInFlight = false;

export interface GoogleAccessTokenResult {
  accessToken: string;
  expiresIn: number;
  scope: string;
}

export function __resetGoogleOAuthForTests(): void {
  oauthRequestInFlight = false;
}

export function getGoogleOAuthCallbackUrl(): string {
  const appBaseUrl =
    typeof document === 'undefined' ? `${window.location.origin}/` : document.baseURI;
  return new URL('google-oauth-callback.html', appBaseUrl).toString();
}

/**
 * Request a Google access token via a same-origin popup relay.
 *
 * This deliberately uses Google's browser implicit-token endpoint instead of
 * GIS: the app's COOP isolation prevents the cross-origin opener communication
 * required by the GIS popup. The callback stays same-origin and returns the
 * short-lived token over a state-bound BroadcastChannel. No backend is used.
 *
 * Must be called from a user gesture (click handler) to avoid popup blockers.
 */
export function requestGoogleAccessToken(clientId: string): Promise<GoogleAccessTokenResult> {
  if (!clientId.trim()) {
    return Promise.reject(
      new Error('Google OAuth Client ID is required. Configure it in Settings.'),
    );
  }
  if (oauthRequestInFlight) {
    return Promise.reject(new Error('Google sign-in is already in progress.'));
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
  oauthRequestInFlight = true;

  return new Promise<GoogleAccessTokenResult>((resolve, reject) => {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    let settled = false;
    let redirectingToGoogle = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      oauthRequestInFlight = false;
      bc.close();
      clearTimeout(timeoutTimer);
      clearInterval(popupPollTimer);
    };

    bc.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null || !('state' in data)) return;
      if (data.state !== state || !('type' in data)) return;

      if (data.type === 'google-oauth-redirecting') {
        // Once the relay leaves our origin, COOP severs its WindowProxy and
        // browsers may report `popup.closed === true` even though Google is
        // still open. Acknowledge the relay before it navigates and stop using
        // the popup handle as a cancellation signal from this point onward.
        redirectingToGoogle = true;
        bc.postMessage({
          type: 'google-oauth-redirect-approved',
          state,
        });
      } else if (data.type === 'google-oauth-result') {
        const accessToken = 'accessToken' in data ? data.accessToken : null;
        const expiresIn = 'expiresIn' in data ? data.expiresIn : null;
        const scope = 'scope' in data ? data.scope : null;
        const grantedScopes = typeof scope === 'string' ? scope.split(/\s+/) : [];

        if (
          typeof accessToken !== 'string' ||
          accessToken.length === 0 ||
          typeof expiresIn !== 'number' ||
          !Number.isFinite(expiresIn) ||
          expiresIn <= 0 ||
          typeof scope !== 'string' ||
          !grantedScopes.includes(GOOGLE_SHEETS_READONLY_SCOPE)
        ) {
          cleanup();
          reject(new Error('Google sign-in returned an invalid or incomplete authorization.'));
          return;
        }

        cleanup();
        resolve({
          accessToken,
          expiresIn,
          scope,
        });
      } else if (data.type === 'google-oauth-error') {
        const error = 'error' in data && typeof data.error === 'string' ? data.error : 'unknown';
        cleanup();
        reject(new Error(`Google auth error: ${error}`));
      }
    };

    const popupPollTimer = setInterval(() => {
      if (!settled && !redirectingToGoogle && popup.closed) {
        cleanup();
        reject(new Error('Google sign-in was cancelled'));
      }
    }, POPUP_POLL_INTERVAL_MS);

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
