# Google OAuth Sign-In for Google Sheets (BYOC)

## Overview

Add a "Google Sign-In" access mode to the Google Sheets wizard, powered by Google Identity Services (GIS). Users bring their own Google OAuth Client ID (configured once in Settings), then authenticate via a popup — no manual bearer token pasting required.

**Problem**: The current "Authorized" mode requires users to manually obtain and paste short-lived (~1h) bearer tokens from the Google OAuth Playground. This is tedious, error-prone, and requires re-pasting when tokens expire.

**Solution**: A browser-native OAuth popup flow using GIS's `initTokenClient`, where the user's own Google Cloud OAuth Client ID drives the consent flow. The existing encrypted secret store and DuckDB HTTP secret mechanism are reused — only the token acquisition path changes.

**Key constraint**: Google does not issue refresh tokens for SPA clients. Tokens last ~1 hour. When expired, a banner prompts the user to re-authorize with a single click (Google auto-approves if prior consent exists).

## Context (from discovery)

- **Settings page**: `src/pages/settings-page/` — block/section pattern defined in `settings.config.ts`; AI Settings component is the closest template for a new section
- **Wizard UI**: `src/features/datasource-wizard/components/google-sheet-config.tsx` — currently has Public / Authorized radio group
- **Connection hook**: `src/features/datasource-wizard/hooks/use-gsheet-connection.ts` — handles discovery, token storage, DuckDB secret creation
- **Data model**: `src/models/data-source.ts` — `GSheetSheetView` with `accessMode: 'public' | 'authorized'` and optional `secretRef`
- **Secret store**: `src/services/secret-store.ts` — AES-GCM encrypted IndexedDB storage (reused as-is)
- **Auth utilities**: `src/utils/gsheet-auth.ts` — DuckDB HTTP secret builders
- **Restore flow**: `src/store/restore.ts` — two-pass restore (secrets → views), orphan cleanup
- **localStorage keys**: `src/models/local-storage.ts` — pattern for app-level config storage
- **No existing Google/GIS script loading** in the app

## Development Approach

- **Testing approach**: Regular (code first, then tests)
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility with existing Public and Bearer Token modes

## Testing Strategy

- **Unit tests**: Required for every task — new services, hooks, utilities
- **Integration tests**: GIS script loader (mock `document.createElement`), token flow state machine
- **Note**: GIS popup itself cannot be tested in unit tests (browser API); test everything around it

## Progress Tracking

- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Implementation Steps

### Task 1: Add Google OAuth Client ID to localStorage config

**Files:**
- Modify: `src/models/local-storage.ts`
- Create: `src/utils/google-oauth-config.ts`
- Create: `tests/unit/utils/google-oauth-config.test.ts`

- [ ] Add `GOOGLE_OAUTH_CLIENT_ID` key to `LOCAL_STORAGE_KEYS` in `src/models/local-storage.ts`
- [ ] Create `src/utils/google-oauth-config.ts` with `getGoogleOAuthClientId()` and `saveGoogleOAuthClientId(clientId: string)` functions (follow pattern from `src/utils/ai-config.ts`)
- [ ] Write tests for get/save/clear of client ID (success + empty/missing cases)
- [ ] Run tests — must pass before next task

### Task 2: Create Google Integration settings section

**Files:**
- Create: `src/pages/settings-page/components/google-integration-settings/google-integration-settings.tsx`
- Create: `src/pages/settings-page/components/google-integration-settings/index.ts`
- Modify: `src/pages/settings-page/settings.config.ts`

- [ ] Create `GoogleIntegrationSettings` component (follow `AISettings` pattern): TextInput for Client ID, Save/Reset buttons, info alert with setup instructions
- [ ] Include inline guidance: link text explaining "Create at console.cloud.google.com → APIs & Services → Credentials → OAuth Client ID (Web application) → Add this origin to Authorized JavaScript origins"
- [ ] Add barrel export in `index.ts`
- [ ] Register as a new "Google Sheets" block in `settings.config.ts` (between "AI Assistant" and "Remote Databases")
- [ ] Write tests for component render, save/load behavior, validation (empty ID, whitespace trimming)
- [ ] Run tests — must pass before next task

### Task 3: GIS script loader service

**Files:**
- Create: `src/services/google-identity-services.ts`
- Create: `src/types/google-identity-services.d.ts`
- Create: `tests/unit/services/google-identity-services.test.ts`

- [ ] Create TypeScript declaration file `src/types/google-identity-services.d.ts` for the GIS `google.accounts.oauth2` API (minimal: `initTokenClient`, `TokenClient`, `TokenResponse`, `requestAccessToken`, `hasGrantedAllScopes`)
- [ ] Create `src/services/google-identity-services.ts` with:
  - `loadGISScript()`: dynamically creates `<script src="https://accounts.google.com/gsi/client">`, returns a Promise that resolves when loaded. Deduplicates — if already loaded, resolves immediately
  - `requestGoogleAccessToken(clientId: string, scope: string): Promise<TokenResponse>`: loads GIS if needed, calls `initTokenClient` + `requestAccessToken`, wraps callback in a Promise. Rejects on error/denial
- [ ] Write tests: script load deduplication, token request success/error paths (mock `google.accounts.oauth2`)
- [ ] Run tests — must pass before next task

### Task 4: Extend data model for `oauth` access mode

**Files:**
- Modify: `src/models/data-source.ts`
- Modify: `src/utils/gsheet-auth.ts`

- [ ] Extend `GSheetAccessMode` type: `'public' | 'authorized' | 'oauth'`
- [ ] Add optional `tokenExpiresAt?: number` field to `GSheetSheetView` (epoch ms, set to `Date.now() + expiresIn * 1000` from GIS response)
- [ ] Update `resolveGSheetAccessToken` in `gsheet-auth.ts` to handle `oauth` mode identically to `authorized` (same secret payload format)
- [ ] Write tests for `resolveGSheetAccessToken` with all access modes
- [ ] Run tests — must pass before next task

### Task 5: Add OAuth flow to wizard UI

**Files:**
- Modify: `src/features/datasource-wizard/components/google-sheet-config.tsx`

- [ ] Add `'oauth'` as a third radio option: `Google Sign-In` (between Public and Bearer Token)
- [ ] When `oauth` is selected and no Client ID is configured, show warning with link to Settings (per agreed UX)
- [ ] When `oauth` is selected and Client ID exists, show a "Sign in with Google" button that calls `requestGoogleAccessToken()` from Task 3
- [ ] On successful auth, store the access token in component state (same `accessToken` field) and show a success indicator (e.g., checkmark + "Authenticated")
- [ ] Pass `accessMode: 'oauth'` and the obtained token to `useGSheetConnection` params
- [ ] Write tests: render all three modes, Client ID missing warning, auth button visibility
- [ ] Run tests — must pass before next task

### Task 6: Update connection hook for OAuth mode

**Files:**
- Modify: `src/features/datasource-wizard/hooks/use-gsheet-connection.ts`
- Modify: `src/features/datasource-wizard/hooks/use-gsheet-connection.ts` (types)

- [ ] Extend `GSheetConnectionParams.accessMode` type to include `'oauth'`
- [ ] In `discoverWorkbook`: treat `oauth` same as `authorized` (both use bearer token for XLSX fetch)
- [ ] In `addGoogleSheet`: for `oauth` mode, store token with same encrypted secret flow as `authorized`, but also store `tokenExpiresAt` on the data source
- [ ] In `addGoogleSheet`: set `accessMode: 'oauth'` on created `GSheetSheetView` data sources
- [ ] Write tests for `addGoogleSheet` with `oauth` access mode params
- [ ] Run tests — must pass before next task

### Task 7: Update DuckDB view creation for OAuth mode

**Files:**
- Modify: `src/controllers/db/data-source.ts`

- [ ] In `createGSheetSheetView`: treat `oauth` same as `authorized` (use `read_gsheet_authorized` macro — same bearer token mechanism)
- [ ] Write test verifying `oauth` mode selects the correct read function
- [ ] Run tests — must pass before next task

### Task 8: Update restore flow for OAuth mode

**Files:**
- Modify: `src/store/restore.ts`

- [ ] In gsheet restore Pass 1: treat `oauth` access mode same as `authorized` for secret resolution and DuckDB HTTP secret creation
- [ ] In gsheet restore Pass 2: pass `oauth` access mode through to `createGSheetSheetView`
- [ ] Add token expiry detection: if `tokenExpiresAt` is set and in the past, log a warning (token will fail on first query — the expiry banner from Task 9 handles re-auth)
- [ ] Write tests for restore with `oauth` data sources (both fresh and expired tokens)
- [ ] Run tests — must pass before next task

### Task 9: Token expiry banner with re-auth

**Files:**
- Create: `src/features/data-explorer/components/gsheet-reauth-banner.tsx`
- Modify: `src/utils/sanitize-error.ts` (if needed for new error patterns)

- [ ] Create `GSheetReauthBanner` component: persistent banner shown when a query against an OAuth gsheet returns a 401 or when `tokenExpiresAt` is known to be past. Shows: "Google session expired for [connection name] — [Re-authorize]"
- [ ] "Re-authorize" button triggers `requestGoogleAccessToken()`, then updates the encrypted secret store and DuckDB HTTP secret in-place (using existing `putSecret` + `buildCreateGSheetHttpSecretQuery` with `CREATE OR REPLACE`)
- [ ] Update `tokenExpiresAt` on affected data sources in app store and persist
- [ ] Write tests: banner renders on expired token, re-auth updates secret, banner dismisses on success
- [ ] Run tests — must pass before next task

### Task 10: Verify acceptance criteria

- [ ] Verify all three access modes work: Public, Google Sign-In, Bearer Token (manual)
- [ ] Verify Settings → Google Integration saves/loads Client ID correctly
- [ ] Verify wizard shows "configure in Settings" warning when no Client ID
- [ ] Verify OAuth popup flow obtains token and discovery works
- [ ] Verify token expiry banner appears and re-auth works
- [ ] Verify backward compatibility: existing `authorized` data sources restore correctly
- [ ] Run full test suite: `npm test` (or project equivalent)
- [ ] Verify no bearer tokens leak in error messages

### Task 11: [Final] Update documentation

- [ ] Update CLAUDE.md if new patterns discovered
- [ ] Move this plan to `docs/plans/completed/`

## Technical Details

### GIS Token Flow

```
User clicks "Sign in with Google"
  → loadGISScript() (idempotent, loads accounts.google.com/gsi/client)
  → google.accounts.oauth2.initTokenClient({
      client_id: <from localStorage>,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      callback: (response) => { ... }
    })
  → tokenClient.requestAccessToken()
  → Google popup → user consents
  → callback fires with { access_token, expires_in, scope, ... }
  → token stored in component state → used for discovery + secret storage
```

### Secret Payload (unchanged)

```json
{ "accessToken": "ya29.a0AfH6SM..." }
```

OAuth mode reuses the same payload format — `resolveGSheetAccessToken()` works identically.

### Data Source Changes

```typescript
// Extended type
type GSheetAccessMode = 'public' | 'authorized' | 'oauth';

// New optional field on GSheetSheetView
tokenExpiresAt?: number;  // epoch ms
```

### localStorage

```typescript
GOOGLE_OAUTH_CLIENT_ID: 'GOOGLE_OAUTH_CLIENT_ID'  // string, the raw client ID
```

### Required Google Scope

`https://www.googleapis.com/auth/spreadsheets.readonly`

### GIS Script URL

`https://accounts.google.com/gsi/client` — loaded dynamically, once, on demand.

## Post-Completion

**Manual verification:**
- Test full flow with a real Google Cloud OAuth Client ID
- Test with a private Google Sheet (not shared publicly)
- Test token expiry by waiting or by manually clearing the DuckDB secret
- Verify Google popup works on both Chrome and Firefox
- Check that the popup is not blocked by browser popup blockers (must be triggered by user gesture)

**User-facing documentation:**
- Consider adding a help link or tooltip in the Settings section pointing to a guide on creating a Google Cloud OAuth Client ID
