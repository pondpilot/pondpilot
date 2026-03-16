/**
 * Minimal type declarations for Google Identity Services (GIS) token model.
 *
 * @see https://developers.google.com/identity/oauth2/web/reference/js-reference
 */

declare namespace google.accounts.oauth2 {
  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: TokenErrorResponse) => void;
    /** Hint for the account to select. */
    hint?: string;
    /** Prompt behavior: '' (default), 'none', 'consent', 'select_account'. */
    prompt?: '' | 'none' | 'consent' | 'select_account';
  }

  interface TokenResponse {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
    error?: undefined;
  }

  interface TokenErrorResponse {
    type: string;
    message?: string;
  }

  interface TokenClient {
    requestAccessToken(overrideConfig?: { prompt?: string; hint?: string }): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;

  function hasGrantedAllScopes(
    tokenResponse: TokenResponse,
    ...scopes: string[]
  ): boolean;

  function revoke(accessToken: string, done?: () => void): void;
}
