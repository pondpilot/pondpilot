# Google OAuth Sign-In for Google Sheets (BYOC)

## Overview

Add a "Google Sign-In" access mode to the Google Sheets wizard. Users bring
their own Google OAuth Client ID (configured once in Settings), then
authenticate via a same-origin popup relay — no manual bearer token pasting
required.

**Problem**: The current "Authorized" mode requires users to manually obtain and paste short-lived (~1h) bearer tokens from the Google OAuth Playground. This is tedious, error-prone, and requires re-pasting when tokens expire.

**Solution**: A browser-only OAuth implicit-token flow where a same-origin
callback page redirects to Google and returns the result through a
state-matched `BroadcastChannel`. The existing encrypted secret store and
DuckDB GSHEET secret mechanism are reused.

**Compatibility decision**: Google recommends GIS for browser token flows, but
GIS popup communication is incompatible with the app's `COOP: same-origin`
isolation (required for SharedArrayBuffer/MotherDuck). This implementation
keeps isolation and avoids adding a token-exchange backend. The direct
short-lived-token endpoint is therefore an explicit browser-only compatibility
exception, not an accidental divergence.

**Key constraint**: Google does not issue refresh tokens for SPA clients. Tokens last ~1 hour. When expired, a banner prompts the user to re-authorize with a single click (Google auto-approves if prior consent exists).

## Context (from discovery)

- **Settings page**: `src/pages/settings-page/` — block/section pattern defined in `settings.config.ts`; AI Settings component is the closest template for a new section
- **Wizard UI**: `src/features/datasource-wizard/components/google-sheet-config.tsx` — currently has Public / Authorized radio group
- **Connection hook**: `src/features/datasource-wizard/hooks/use-gsheet-connection.ts` — handles discovery, token storage, DuckDB secret creation
- **Data model**: `src/models/data-source.ts` — `GSheetSheetView` with `accessMode: 'public' | 'authorized'` and optional `secretRef`
- **Secret store**: `src/services/secret-store.ts` — AES-GCM encrypted IndexedDB storage (reused as-is)
- **Auth utilities**: `src/utils/gsheet-auth.ts` — DuckDB GSHEET secret builders
- **Restore flow**: `src/store/restore.ts` — two-pass restore (secrets → views), orphan cleanup
- **localStorage keys**: `src/models/local-storage.ts` — pattern for app-level config storage
- **OAuth callback**: `public/google-oauth-callback.html`

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
- **Integration tests**: popup relay/token state machine with browser APIs mocked
- **Note**: Real Google consent cannot be automated without a configured client
  and account; test validation and lifecycle behavior around it

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

- [x] Add `GOOGLE_OAUTH_CLIENT_ID` key to `LOCAL_STORAGE_KEYS` in `src/models/local-storage.ts`
- [x] Create `src/utils/google-oauth-config.ts` with `getGoogleOAuthClientId()` and `saveGoogleOAuthClientId(clientId: string)` functions (follow pattern from `src/utils/ai-config.ts`)
- [x] Write tests for get/save/clear of client ID (success + empty/missing cases)
- [x] Run tests — must pass before next task

### Task 2: Create Google Integration settings section

**Files:**
- Create: `src/pages/settings-page/components/google-integration-settings/google-integration-settings.tsx`
- Create: `src/pages/settings-page/components/google-integration-settings/index.ts`
- Modify: `src/pages/settings-page/settings.config.ts`

- [x] Create `GoogleIntegrationSettings` component (follow `AISettings` pattern): TextInput for Client ID, Save/Reset buttons, info alert with setup instructions
- [x] Include inline guidance: link text explaining "Create at console.cloud.google.com → APIs & Services → Credentials → OAuth Client ID (Web application) → Add this origin to Authorized JavaScript origins"
- [x] Add barrel export in `index.ts`
- [x] Register as a new "Google Sheets" block in `settings.config.ts` (between "AI Assistant" and "Remote Databases")
- [x] Core logic tested via google-oauth-config unit tests; component rendering not tested (project has no jsdom/React test setup)
- [x] TypeScript compiles cleanly

### Task 3: Same-origin OAuth relay service

**Files:**
- Create: `src/services/google-identity-services.ts`
- Create: `tests/unit/services/google-identity-services.test.ts`

- [x] Create `public/google-oauth-callback.html` as the same-origin relay
- [x] Create `requestGoogleAccessToken(clientId)` using a state-bound
  `BroadcastChannel`, popup cancellation polling, and a five-minute timeout
- [x] Validate the returned token, positive finite expiry, and required scope
- [x] Write tests for success, denial, invalid messages, cancellation, and timeout
- [x] Run tests — must pass before next task

### Task 4: Extend data model for `oauth` access mode

**Files:**
- Modify: `src/models/data-source.ts`
- Modify: `src/utils/gsheet-auth.ts`

- [x] Extend `GSheetAccessMode` type: `'public' | 'authorized' | 'oauth'`
- [x] Add optional `tokenExpiresAt?: number` field to `GSheetSheetView` (epoch ms)
- [x] `resolveGSheetAccessToken` already handles `oauth` identically to `authorized` (same secret payload format, no changes needed)
- [x] Existing tests for `resolveGSheetAccessToken` cover the shared behavior
- [x] Run tests — must pass before next task

### Task 5: Add OAuth flow to wizard UI

**Files:**
- Modify: `src/features/datasource-wizard/components/google-sheet-config.tsx`

- [x] Add `'oauth'` as a third radio option: `Google Sign-In` (between Public and Bearer Token)
- [x] When `oauth` is selected and no Client ID is configured, show warning with link to Settings (per agreed UX)
- [x] When `oauth` is selected and Client ID exists, show a "Sign in with Google" button that calls `requestGoogleAccessToken()` from Task 3
- [x] On successful auth, store the token only in the dedicated short-lived
  app cache and show a success indicator
- [x] Pass `accessMode: 'oauth'` and the obtained token to `useGSheetConnection` params
- [x] Component rendering not tested (project has no jsdom/React test setup); logic tested via unit tests
- [x] Run focused tests before the next task

### Task 6: Update connection hook for OAuth mode

**Files:**
- Modify: `src/features/datasource-wizard/hooks/use-gsheet-connection.ts`
- Modify: `src/features/datasource-wizard/hooks/use-gsheet-connection.ts` (types)

- [x] Extend `GSheetConnectionParams.accessMode` type to `GSheetAccessMode`, add optional `tokenExpiresIn`
- [x] In `discoverWorkbook`: treat `oauth` same as `authorized` (both use bearer token for XLSX fetch)
- [x] In `addGoogleSheet`: for `oauth` mode, store token with same encrypted secret flow as `authorized`, plus compute `tokenExpiresAt` on the data source
- [x] In `addGoogleSheet`: set `accessMode: 'oauth'` on created `GSheetSheetView` data sources
- [x] Updated `addGSheetSheetDataSource` in `data-source.ts` to accept and pass through `tokenExpiresAt`
- [x] Focused and full unit suites pass

### Task 7: Update DuckDB view creation for OAuth mode

**Files:**
- Modify: `src/controllers/db/data-source.ts`

- [x] In `createGSheetSheetView`: accept `GSheetAccessMode`, treat `oauth`
  like `authorized`, and use `system.main.read_gsheet` with a named GSHEET
  secret
- [x] Updated together with Task 4 since the type change required the controller update
- [x] Run tests — must pass before next task

### Task 8: Update restore flow for OAuth mode

**Files:**
- Modify: `src/store/restore.ts`

- [x] In gsheet restore Pass 1: treat `oauth` like `authorized` for secret
  resolution and DuckDB GSHEET secret creation
- [x] Skip re-binding views already persisted in the OPFS database so startup
  does not re-fetch every worksheet
- [x] In gsheet restore Pass 2: `oauth` access mode flows through to `createGSheetSheetView` (already handled by Task 7 type change)
- [x] Add token expiry detection: if `tokenExpiresAt` is set and in the past, log a warning
- [x] Focused and full unit suites pass

### Task 9: Token expiry banner with re-auth

**Files:**
- Create: `src/features/data-explorer/components/gsheet-reauth-banner.tsx`
- Modify: `src/utils/sanitize-error.ts` (if needed for new error patterns)

- [x] Created `src/utils/gsheet-reauth.ts` with `reauthGSheetOAuth()` and `notifyGSheetTokenExpired()` using `showWarningWithAction` (Mantine notification with "Re-authorize" button — simpler than a custom banner component)
- [x] Re-auth updates the encrypted secret store, replaces the one named DuckDB
  GSHEET secret without re-fetching every worksheet, and updates
  `tokenExpiresAt` on related data sources
- [x] Integrated into `use-init-application.tsx`: after restore, checks all OAuth gsheet data sources for expired tokens and shows one notification per connection
- [x] Focused and full unit suites pass

### Task 10: Verify acceptance criteria

- [x] Verify all three access modes work: Public, Google Sign-In, Bearer Token (manual) — all code paths compile and tests pass
- [x] Verify Settings → Google Integration saves/loads Client ID correctly — tested via unit tests
- [x] Verify wizard shows "configure in Settings" warning when no Client ID — implemented in google-sheet-config.tsx
- [ ] Verify OAuth popup flow obtains token and discovery works (requires manual testing with real Client ID)
- [ ] Verify token expiry notification appears and re-auth works (requires manual testing)
- [x] Verify backward compatibility: existing `authorized` data sources restore correctly — restore flow updated to handle both `authorized` and `oauth`
- [x] Run full test suite (latest branch validation is recorded in the review handoff)
- [x] Verify bearer-token SQL errors are sanitized, including DuckDB's `:=` syntax

### Task 11: [Final] Update documentation

- [ ] Update CLAUDE.md if new patterns discovered
- [ ] Move this plan to `docs/plans/completed/`

## Technical Details

### Browser-only token flow

```
User clicks "Sign in with Google"
  → open same-origin google-oauth-callback.html with random state
  → callback page redirects to accounts.google.com/o/oauth2/v2/auth
  → Google redirects back with a short-lived token in the URL fragment
  → callback validates the response and posts it through BroadcastChannel
  → opener matches state, scope, token, and expiry
  → token is used for discovery and encrypted secret storage
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

### Google endpoint

`https://accounts.google.com/o/oauth2/v2/auth` with `response_type=token`.

## Post-Completion

**Manual verification:**
- Test full flow with a real Google Cloud OAuth Client ID
- Test with a private Google Sheet (not shared publicly)
- Test token expiry by waiting or by manually clearing the DuckDB secret
- Verify Google popup works on both Chrome and Firefox
- Check that the popup is not blocked by browser popup blockers (must be triggered by user gesture)

**User-facing documentation:**
- Consider adding a help link or tooltip in the Settings section pointing to a guide on creating a Google Cloud OAuth Client ID
