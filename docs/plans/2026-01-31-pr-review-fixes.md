# PR Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all 13 issues identified in the mpt code review of the `secrets_support` branch.

**Architecture:** Targeted fixes across parsing, handler, UI, and crypto layers. No new modules — all changes fit within existing files. TDD approach: write failing tests first, then implement fixes.

**Tech Stack:** TypeScript, React, Jest, Zustand, Web Crypto API

---

### Task 1: Fix parsing to support quoted identifiers (Issue #4)

**Files:**
- Modify: `src/utils/attach-parser.ts:118-119` (ICEBERG_ATTACH_REGEX)
- Modify: `src/utils/attach-parser.ts:208-209` (CREATE_SECRET_REGEX)
- Modify: `src/utils/attach-parser.ts:230-241` (option extraction in parseCreateSecretStatement)
- Test: `tests/unit/utils/attach-parser.test.ts`

**Step 1: Write failing tests for quoted identifiers**

Add to `tests/unit/utils/attach-parser.test.ts` in the `parseIcebergAttachStatement` describe block:

```typescript
it('should parse Iceberg ATTACH with hyphenated quoted alias', () => {
  const sql =
    "ATTACH 'wh' AS \"my-catalog\" (TYPE ICEBERG, SECRET s)";
  const result = parseIcebergAttachStatement(sql);
  expect(result).not.toBeNull();
  expect(result?.catalogAlias).toBe('my-catalog');
});

it('should parse Iceberg ATTACH with dotted quoted alias', () => {
  const sql =
    "ATTACH 'wh' AS \"my.catalog\" (TYPE ICEBERG, SECRET s)";
  const result = parseIcebergAttachStatement(sql);
  expect(result).not.toBeNull();
  expect(result?.catalogAlias).toBe('my.catalog');
});
```

Add a new `describe('parseCreateSecretStatement')` block:

```typescript
describe('parseCreateSecretStatement', () => {
  it('should parse basic CREATE SECRET', () => {
    const sql = "CREATE SECRET my_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey')";
    const result = parseCreateSecretStatement(sql);
    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('my_secret');
    expect(result?.secretType).toBe('s3');
    expect(result?.options).toEqual({ KEY_ID: 'AKID', SECRET: 'skey' });
  });

  it('should parse CREATE SECRET with quoted name', () => {
    const sql = "CREATE SECRET \"my-secret\" (TYPE s3, KEY_ID 'AKID')";
    const result = parseCreateSecretStatement(sql);
    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('my-secret');
  });

  it('should parse CREATE OR REPLACE SECRET with quoted name', () => {
    const sql = "CREATE OR REPLACE SECRET \"my.secret\" (TYPE iceberg, TOKEN 'tok')";
    const result = parseCreateSecretStatement(sql);
    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('my.secret');
  });

  it('should parse unquoted option values for known keys', () => {
    const sql = "CREATE SECRET my_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey', REGION us-east-1)";
    const result = parseCreateSecretStatement(sql);
    expect(result).not.toBeNull();
    expect(result?.options.REGION).toBe('us-east-1');
  });

  it('should return null for non-CREATE SECRET statements', () => {
    expect(parseCreateSecretStatement('CREATE TABLE foo (id INT)')).toBeNull();
    expect(parseCreateSecretStatement('SELECT 1')).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `yarn test:unit tests/unit/utils/attach-parser.test.ts`
Expected: Tests for quoted identifiers and unquoted REGION fail.

**Step 3: Update regexes to support quoted identifiers**

In `src/utils/attach-parser.ts`:

Update `ICEBERG_ATTACH_REGEX` (line 118-119):
```typescript
const ICEBERG_ATTACH_REGEX =
  /ATTACH\s+(?:DATABASE\s+)?(?:IF\s+NOT\s+EXISTS\s+)?['"]([^'"]+)['"]\s+AS\s+(?:"([^"]+)"|(\w+))\s*\(([^)]+)\)/i;
```

Update the destructuring in `parseIcebergAttachStatement` (line 141):
```typescript
const [, warehouseName, quotedAlias, unquotedAlias, optionsBlock] = match;
const catalogAlias = (quotedAlias ?? unquotedAlias).replace(/;$/, '');
```

Update `CREATE_SECRET_REGEX` (line 208-209):
```typescript
const CREATE_SECRET_REGEX =
  /CREATE\s+(?:OR\s+REPLACE\s+)?SECRET\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|(\w+))\s*\(([^)]+)\)/i;
```

Update the destructuring in `parseCreateSecretStatement` (line 223):
```typescript
const [, quotedName, unquotedName, optionsBlock] = match;
const secretName = quotedName ?? unquotedName;
```

Add unquoted option extraction for known keys. After the quoted options loop (line 241), add:

```typescript
// Also extract unquoted values for known keys like REGION
const KNOWN_UNQUOTED_KEYS = ['REGION', 'ENDPOINT', 'ENDPOINT_TYPE'];
for (const knownKey of KNOWN_UNQUOTED_KEYS) {
  if (!options[knownKey]) {
    const unquotedVal = extractUnquotedOption(optionsBlock, knownKey);
    if (unquotedVal && unquotedVal.toUpperCase() !== 'TYPE') {
      options[knownKey] = unquotedVal;
    }
  }
}
```

Note: `extractUnquotedOption` already exists in the file but is not exported. It uses `\w+` which won't match `us-east-1`. Update it to also match hyphens:

```typescript
function extractUnquotedOption(optionsBlock: string, key: string): string | undefined {
  const regex = new RegExp(`\\b${key}\\s+([\\w-]+)`, 'i');
  const match = optionsBlock.match(regex);
  return match?.[1];
}
```

**Step 4: Run tests to verify they pass**

Run: `yarn test:unit tests/unit/utils/attach-parser.test.ts`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/utils/attach-parser.ts tests/unit/utils/attach-parser.test.ts
git commit -m "fix: support quoted identifiers in ATTACH and CREATE SECRET parsing"
```

---

### Task 2: Handle CREATE SECRET without ATTACH (Issue #2)

**Files:**
- Modify: `src/features/tab-view/views/script-tab-view.tsx:362-394`
- Test: `tests/unit/utils/attach-detach-handler.test.ts`

**Step 1: Write failing test for standalone CREATE SECRET persistence**

Add to `tests/unit/utils/attach-detach-handler.test.ts` a new describe block. First add the mock for secret store at the top:

```typescript
const mockPutSecret = jest.fn<any>().mockResolvedValue(undefined);
const mockMakeSecretId = jest.fn<any>().mockReturnValue('generated-secret-id');

jest.mock('@services/secret-store', () => ({
  putSecret: (...args: unknown[]) => mockPutSecret(...args),
  makeSecretId: () => mockMakeSecretId(),
  deleteSecret: jest.fn<any>().mockResolvedValue(undefined),
}));
```

Then add the import and test:

```typescript
import { handleCreateSecretStatements } from '@utils/attach-detach-handler';

describe('handleCreateSecretStatements', () => {
  beforeEach(() => {
    mockPutSecret.mockClear();
    mockMakeSecretId.mockClear();
  });

  it('should persist CREATE SECRET to encrypted store', async () => {
    const statements = [
      makeStatement(
        "CREATE SECRET my_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey', REGION 'us-east-1')",
        SQLStatement.CREATE,
      ),
    ];

    const mapping = await handleCreateSecretStatements(statements);

    expect(mapping.size).toBe(1);
    expect(mapping.has('my_secret')).toBe(true);
    expect(mockPutSecret).toHaveBeenCalledTimes(1);
  });

  it('should skip non-CREATE statements', async () => {
    const statements = [
      makeStatement('SELECT 1', SQLStatement.SELECT),
    ];

    const mapping = await handleCreateSecretStatements(statements);

    expect(mapping.size).toBe(0);
    expect(mockPutSecret).not.toHaveBeenCalled();
  });

  it('should derive sigv4 auth type for s3 secret type', async () => {
    const statements = [
      makeStatement(
        "CREATE SECRET aws_creds (TYPE s3, KEY_ID 'AKID', SECRET 'skey')",
        SQLStatement.CREATE,
      ),
    ];

    const mapping = await handleCreateSecretStatements(statements);

    const entry = mapping.get('aws_creds');
    expect(entry?.authType).toBe('sigv4');
    expect(entry?.secretType).toBe('s3');
  });

  it('should derive oauth2 auth type when CLIENT_ID present', async () => {
    const statements = [
      makeStatement(
        "CREATE SECRET oauth_creds (TYPE iceberg, CLIENT_ID 'cid', CLIENT_SECRET 'csec')",
        SQLStatement.CREATE,
      ),
    ];

    const mapping = await handleCreateSecretStatements(statements);

    const entry = mapping.get('oauth_creds');
    expect(entry?.authType).toBe('oauth2');
  });
});
```

**Step 2: Run tests to verify they pass (these test existing behavior)**

Run: `yarn test:unit tests/unit/utils/attach-detach-handler.test.ts`
Expected: PASS (we're testing existing behavior to establish baseline).

**Step 3: Fix script-tab-view to handle CREATE SECRET independently**

In `src/features/tab-view/views/script-tab-view.tsx`, change lines 362-394:

Replace:
```typescript
const hasAttachDetach = classifiedStatements.some(
  (s) => s.type === SQLStatement.ATTACH || s.type === SQLStatement.DETACH,
);
```

With:
```typescript
const hasAttachDetach = classifiedStatements.some(
  (s) => s.type === SQLStatement.ATTACH || s.type === SQLStatement.DETACH,
);
const hasCreateSecret = classifiedStatements.some(
  (s) =>
    s.type === SQLStatement.CREATE &&
    SECRET_STATEMENT_PATTERN.test(s.code),
);
```

Then change:
```typescript
if (hasAttachDetach) {
  // Process CREATE SECRET statements first so ATTACH can reference them
  const secretMapping = await handleCreateSecretStatements(classifiedStatements);
  const handlerContext = { dataSources, updatedDataSources, updatedMetadata };
  await handleAttachStatements(classifiedStatements, handlerContext, secretMapping);
  await handleDetachStatements(classifiedStatements, handlerContext);
}
```

To:
```typescript
if (hasAttachDetach || hasCreateSecret) {
  // Process CREATE SECRET statements first so ATTACH can reference them
  const secretMapping = await handleCreateSecretStatements(classifiedStatements);
  const handlerContext = { dataSources, updatedDataSources, updatedMetadata };
  if (hasAttachDetach) {
    await handleAttachStatements(classifiedStatements, handlerContext, secretMapping);
    await handleDetachStatements(classifiedStatements, handlerContext);
  }
}
```

**Step 4: Run typecheck**

Run: `yarn typecheck`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/features/tab-view/views/script-tab-view.tsx tests/unit/utils/attach-detach-handler.test.ts
git commit -m "fix: persist CREATE SECRET statements even without accompanying ATTACH"
```

---

### Task 3: Extract shared `isManagedIcebergEndpoint` helper (Issue #7)

**Files:**
- Modify: `src/utils/iceberg-catalog.ts` (add helper)
- Modify: `src/utils/attach-detach-handler.ts` (use helper)
- Modify: `src/features/datasource-wizard/components/iceberg-catalog-config.tsx` (use helper)

**Step 1: Add the helper to iceberg-catalog.ts**

At the top of `src/utils/iceberg-catalog.ts`, after the imports, add:

```typescript
/**
 * Whether the given endpoint type is a managed AWS service (Glue or S3 Tables).
 * Managed endpoints require SigV4 auth and use TYPE s3 secrets.
 */
export function isManagedIcebergEndpoint(
  endpointType?: string,
): boolean {
  const upper = endpointType?.toUpperCase();
  return upper === 'GLUE' || upper === 'S3_TABLES';
}
```

**Step 2: Replace duplicated checks across files**

In `src/utils/iceberg-catalog.ts`, `reconnectIcebergCatalog` function (~line 158-161), replace:
```typescript
const isManagedEndpoint =
  catalog.endpointType === 'GLUE' ||
  catalog.endpointType === 'S3_TABLES' ||
  credentials.authType === 'sigv4';
```
With:
```typescript
const isManagedEndpoint =
  isManagedIcebergEndpoint(catalog.endpointType) ||
  credentials.authType === 'sigv4';
```

In `src/utils/attach-detach-handler.ts`, add import and replace usage in `inferSecretFromBatch` (~line 112-114):
```typescript
import { isManagedIcebergEndpoint } from '@utils/iceberg-catalog';
```
Replace:
```typescript
const requiredSecretType =
  endpointType?.toUpperCase() === 'S3_TABLES' || endpointType?.toUpperCase() === 'GLUE'
    ? 's3'
    : 'iceberg';
```
With:
```typescript
const requiredSecretType = isManagedIcebergEndpoint(endpointType) ? 's3' : 'iceberg';
```

In `src/features/datasource-wizard/components/iceberg-catalog-config.tsx`, add import and replace (~line 80):
```typescript
import { buildIcebergSecretPayload, isManagedIcebergEndpoint } from '@utils/iceberg-catalog';
```
Replace:
```typescript
const isManagedEndpoint = endpointType === 'GLUE' || endpointType === 'S3_TABLES';
```
With:
```typescript
const isManagedEndpoint = isManagedIcebergEndpoint(endpointType);
```

**Step 3: Run tests and typecheck**

Run: `yarn typecheck && yarn test:unit`
Expected: All pass.

**Step 4: Commit**

```bash
git add src/utils/iceberg-catalog.ts src/utils/attach-detach-handler.ts src/features/datasource-wizard/components/iceberg-catalog-config.tsx
git commit -m "refactor: extract shared isManagedIcebergEndpoint helper"
```

---

### Task 4: Add Web Crypto feature detection (Issue #5)

**Files:**
- Modify: `src/services/secret-store.ts:52-78` (getOrCreateCryptoKey)
- Test: `tests/unit/services/secret-store.test.ts` (create if missing)

**Step 1: Add feature detection to getOrCreateCryptoKey**

In `src/services/secret-store.ts`, at the beginning of `getOrCreateCryptoKey()`, add:

```typescript
export async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Web Crypto API is not available. Secret storage requires a secure context (HTTPS or localhost).',
    );
  }

  // ... rest of existing code
```

**Step 2: Run typecheck**

Run: `yarn typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/services/secret-store.ts
git commit -m "fix: add Web Crypto API feature detection in secret store"
```

---

### Task 5: Optimize bufferToBase64 (Issue #10)

**Files:**
- Modify: `src/services/secret-store.ts:93-100`

**Step 1: Replace the O(n) string concatenation**

In `src/services/secret-store.ts`, replace `bufferToBase64`:

```typescript
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}
```

Note: For very large buffers (>65536 bytes) this would hit the max arguments limit, but secrets are small payloads. The current use case (encrypted credential JSON) is well under this limit.

**Step 2: Run existing tests**

Run: `yarn test:unit`
Expected: All pass (crypto roundtrip tests cover this).

**Step 3: Commit**

```bash
git add src/services/secret-store.ts
git commit -m "perf: optimize bufferToBase64 to avoid O(n) string concatenation"
```

---

### Task 6: Add error message sanitization (Issue #3)

**Files:**
- Create: `src/utils/sanitize-error.ts`
- Test: `tests/unit/utils/sanitize-error.test.ts`
- Modify: `src/utils/iceberg-catalog.ts` (use sanitizer)
- Modify: `src/features/datasource-wizard/components/iceberg-catalog-config.tsx` (use sanitizer)

**Step 1: Write failing tests**

Create `tests/unit/utils/sanitize-error.test.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';

import { sanitizeErrorMessage } from '../../../src/utils/sanitize-error';

describe('sanitizeErrorMessage', () => {
  it('should pass through normal error messages unchanged', () => {
    expect(sanitizeErrorMessage('Connection refused')).toBe('Connection refused');
  });

  it('should redact CREATE SECRET SQL from error messages', () => {
    const msg = "Error in CREATE SECRET my_secret (TYPE s3, KEY_ID 'AKID', SECRET 'skey')";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('AKID');
    expect(result).not.toContain('skey');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact CLIENT_SECRET values', () => {
    const msg = "Failed: CLIENT_SECRET 'super-secret-value' is invalid";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('super-secret-value');
  });

  it('should redact TOKEN values', () => {
    const msg = "Error: TOKEN 'eyJhbGciOiJIUzI1NiJ9.payload.sig' expired";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('should redact KEY_ID and SECRET values', () => {
    const msg = "KEY_ID 'AKIA1234' SECRET 'mysecretkey123'";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('AKIA1234');
    expect(result).not.toContain('mysecretkey123');
  });

  it('should handle empty strings', () => {
    expect(sanitizeErrorMessage('')).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test:unit tests/unit/utils/sanitize-error.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the sanitizer**

Create `src/utils/sanitize-error.ts`:

```typescript
/**
 * Sanitizes error messages to prevent leaking credentials that may have
 * been embedded in SQL statements (e.g. CREATE SECRET).
 */

/** Patterns that match credential-like key-value pairs in error messages. */
const CREDENTIAL_PATTERNS = [
  // KEY 'value' or KEY "value" for sensitive keys
  /\b(CLIENT_SECRET|TOKEN|SECRET|KEY_ID|CLIENT_ID)\s+['"][^'"]*['"]/gi,
  // Full CREATE SECRET ... (...) blocks
  /CREATE\s+(?:OR\s+REPLACE\s+)?SECRET\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|[\w]+)\s*\([^)]*\)/gi,
];

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of CREDENTIAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep the key name but redact the value
      const keyMatch = match.match(/^(\w+)\s+/);
      if (keyMatch) {
        return `${keyMatch[1]} [REDACTED]`;
      }
      return '[REDACTED]';
    });
  }
  return sanitized;
}
```

**Step 4: Run test to verify it passes**

Run: `yarn test:unit tests/unit/utils/sanitize-error.test.ts`
Expected: PASS.

**Step 5: Apply sanitizer to error display sites**

In `src/utils/iceberg-catalog.ts`, add import at top:
```typescript
import { sanitizeErrorMessage } from '@utils/sanitize-error';
```

In `reconnectIcebergCatalog`, around line 303-311, wrap error messages:
```typescript
if (error instanceof MaxRetriesExceededError) {
  errorMessage = sanitizeErrorMessage(
    `Connection timeout after ${error.attempts} attempts: ${error.lastError.message}`,
  );
} else if (error instanceof Error) {
  errorMessage = sanitizeErrorMessage(error.message);
} else {
  errorMessage = sanitizeErrorMessage(String(error));
}
```

In `src/features/datasource-wizard/components/iceberg-catalog-config.tsx`, add import:
```typescript
import { sanitizeErrorMessage } from '@utils/sanitize-error';
```

In `handleTest` catch block (~line 167):
```typescript
const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
```

In `handleAdd` catch block (~line 337):
```typescript
const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
```

**Step 6: Run all tests and typecheck**

Run: `yarn typecheck && yarn test:unit`
Expected: All pass.

**Step 7: Commit**

```bash
git add src/utils/sanitize-error.ts tests/unit/utils/sanitize-error.test.ts src/utils/iceberg-catalog.ts src/features/datasource-wizard/components/iceberg-catalog-config.tsx
git commit -m "fix: sanitize error messages to prevent credential leakage"
```

---

### Task 7: Fix race condition in test/add flow (Issue #9)

**Files:**
- Modify: `src/features/datasource-wizard/components/iceberg-catalog-config.tsx`

**Step 1: Guard handleAdd against concurrent operations**

The `handleTest` already guards with `if (isTesting || isLoading) return;`. The `handleAdd` button is disabled when `isTesting` is true via the JSX (line 519: `disabled={!isFormValid() || isTesting}`), and the test button is disabled when `isLoading` (line 511). However, `handleAdd` itself doesn't have the early return guard.

In `handleAdd` (line 184), add the same guard:

```typescript
const handleAdd = async () => {
  if (isLoading || isTesting) return;
  // ... rest of function
```

**Step 2: Run typecheck**

Run: `yarn typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/features/datasource-wizard/components/iceberg-catalog-config.tsx
git commit -m "fix: guard handleAdd against concurrent test/add operations"
```

---

### Task 8: Fix useIcebergCatalogNodes exhaustive-deps (Issue #12)

**Files:**
- Modify: `src/features/data-explorer/hooks/use-iceberg-catalog-nodes.ts`

**Step 1: Add missing deps and remove eslint-disable**

Replace the useMemo block:

```typescript
return useMemo(
  () =>
    icebergCatalogs.map((catalog) =>
      buildIcebergCatalogNode(catalog, {
        nodeMap,
        anyNodeIdToNodeTypeMap,
        conn,
        localDatabases: [],
        localDBLocalEntriesMap: new Map(),
        databaseMetadata,
        initialExpandedState,
        flatFileSources,
        comparisonTableNames,
        comparisonByTableName,
      }),
    ),
  [
    icebergCatalogs,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    databaseMetadata,
    initialExpandedState,
    flatFileSources,
    comparisonTableNames,
    comparisonByTableName,
  ],
);
```

**Step 2: Run typecheck and lint**

Run: `yarn typecheck && yarn lint`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/features/data-explorer/hooks/use-iceberg-catalog-nodes.ts
git commit -m "fix: add missing deps to useIcebergCatalogNodes useMemo"
```

---

### Task 9: Document crypto limitations (Issue #13)

**Files:**
- Modify: `src/services/secret-store.ts` (add comments at top of file)

**Step 1: Expand the module doc comment**

Replace the existing doc comment at top of `src/services/secret-store.ts`:

```typescript
/**
 * Encrypted Secret Store
 *
 * Persists secrets (credentials, API keys) encrypted with AES-GCM using a
 * non-extractable CryptoKey stored in a dedicated IndexedDB database,
 * separate from the main app-data DB.
 *
 * Each secret value is encrypted with a unique random 12-byte IV.
 * Labels are stored unencrypted for listing without decryption.
 * If the key is lost (browser partial clear), decryption fails gracefully.
 *
 * Security considerations:
 * - This does NOT protect against XSS or malicious JS on the same origin.
 *   The non-extractable key prevents raw key exfiltration, but JS can still
 *   call encrypt/decrypt through the Web Crypto API.
 * - If the browser clears the key database (pondpilot-secret-key) while
 *   retaining app-data, all encrypted secrets become unrecoverable.
 * - There is currently no key rotation mechanism. Adding rotation would
 *   require re-encrypting all secrets with a new key on access.
 */
```

**Step 2: Commit**

```bash
git add src/services/secret-store.ts
git commit -m "docs: document secret store crypto limitations and threat model"
```

---

### Task 10: Add AI config migration tests (Issue #11 partial)

**Files:**
- Test: `tests/unit/utils/ai-config.test.ts` (create)

**Step 1: Write tests**

Create `tests/unit/utils/ai-config.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mocks must be declared before jest.mock calls
const mockGetSecret = jest.fn<any>();
const mockPutSecret = jest.fn<any>().mockResolvedValue(undefined);
const mockGetJSONCookie = jest.fn<any>();
const mockSetJSONCookie = jest.fn<any>();

jest.mock('../../src/services/secret-store', () => ({
  getSecret: (...args: unknown[]) => mockGetSecret(...args),
  putSecret: (...args: unknown[]) => mockPutSecret(...args),
}));

jest.mock('../../src/utils/cookies', () => ({
  getJSONCookie: (...args: unknown[]) => mockGetJSONCookie(...args),
  setJSONCookie: (...args: unknown[]) => mockSetJSONCookie(...args),
}));

import { initAIConfigFromSecretStore, getAIConfig, AI_API_KEYS_SECRET_ID } from '../../src/utils/ai-config';

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

    it('should handle errors gracefully', async () => {
      mockGetSecret.mockRejectedValue(new Error('IDB error'));

      // Should not throw
      await expect(initAIConfigFromSecretStore(mockIDb)).resolves.toBeUndefined();
    });
  });
});
```

**Step 2: Run tests**

Run: `yarn test:unit tests/unit/utils/ai-config.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add tests/unit/utils/ai-config.test.ts
git commit -m "test: add AI config migration tests"
```

---

### Task 11: Standardize error handling pattern (Issue #8)

**Files:**
- Modify: `src/utils/iceberg-catalog.ts`

This is a lighter touch — add a comment documenting the pattern and align the `disconnectIcebergCatalog` function to use the same error → state update pattern as `reconnectIcebergCatalog`.

**Step 1: Add comment documenting error handling convention**

At the top of `src/utils/iceberg-catalog.ts`, after the imports, add:

```typescript
/**
 * Error handling convention for Iceberg operations:
 * - Public functions (reconnect, disconnect) catch all errors
 * - Errors are reported via updateIcebergCatalogConnectionState + showError
 * - Functions return boolean success or void — callers check connection state
 * - Sanitize all error messages before displaying to users
 */
```

**Step 2: Apply sanitizeErrorMessage to disconnectIcebergCatalog**

In `disconnectIcebergCatalog` (~line 387):
```typescript
const errorMessage = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
```

**Step 3: Run typecheck**

Run: `yarn typecheck`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/utils/iceberg-catalog.ts
git commit -m "refactor: standardize and document error handling in Iceberg operations"
```

---

### Task 12: Extract iceberg-catalog-config hooks (Issue #6)

**Files:**
- Create: `src/features/datasource-wizard/hooks/use-iceberg-connection.ts`
- Modify: `src/features/datasource-wizard/components/iceberg-catalog-config.tsx`

**Step 1: Extract the connection logic into a hook**

Create `src/features/datasource-wizard/hooks/use-iceberg-connection.ts`:

```typescript
import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { notifications } from '@mantine/notifications';
import { IcebergAuthType, IcebergCatalog } from '@models/data-source';
import { makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { executeWithRetry } from '@utils/connection-manager';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { buildIcebergSecretPayload, isManagedIcebergEndpoint } from '@utils/iceberg-catalog';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { escapeSqlStringValue } from '@utils/sql-security';
import {
  buildIcebergSecretQuery,
  buildDropSecretQuery,
  buildIcebergAttachQuery,
} from '@utils/iceberg-sql-builder';
import { useState, useCallback } from 'react';

interface IcebergConnectionParams {
  catalogAlias: string;
  warehouseName: string;
  endpoint: string;
  endpointType: string;
  authType: IcebergAuthType;
  clientId: string;
  clientSecret: string;
  oauth2ServerUri: string;
  token: string;
  awsKeyId: string;
  awsSecret: string;
  defaultRegion: string;
  useCorsProxy: boolean;
}

function generateSecretName(alias: string): string {
  const suffix = Date.now().toString(36);
  return `iceberg_secret_${alias}_${suffix}`;
}

export function useIcebergConnection(pool: AsyncDuckDBConnectionPool | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const testConnection = useCallback(
    async (params: IcebergConnectionParams): Promise<boolean> => {
      if (isTesting || isLoading || !pool) return false;

      setIsTesting(true);
      const alias = params.catalogAlias.trim();
      const isManagedEndpoint = isManagedIcebergEndpoint(params.endpointType);
      const effectiveAuthType = isManagedEndpoint ? 'sigv4' : params.authType;
      const secretName = generateSecretName(alias);

      try {
        const secretQuery = buildIcebergSecretQuery({
          secretName,
          authType: effectiveAuthType,
          useS3SecretType: isManagedEndpoint,
          clientId: params.clientId.trim(),
          clientSecret: params.clientSecret.trim(),
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          token: params.token.trim(),
          awsKeyId: params.awsKeyId.trim() || undefined,
          awsSecret: params.awsSecret.trim() || undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
        });
        await pool.query(secretQuery);

        const attachQuery = buildIcebergAttachQuery({
          warehouseName: params.warehouseName.trim(),
          catalogAlias: alias,
          endpoint: isManagedEndpoint ? undefined : params.endpoint.trim(),
          endpointType: isManagedEndpoint
            ? (params.endpointType as 'GLUE' | 'S3_TABLES')
            : undefined,
          secretName,
          useCorsProxy: params.useCorsProxy,
        });
        await executeWithRetry(pool, attachQuery, {
          maxRetries: 1,
          timeout: 15000,
        });

        const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${escapeSqlStringValue(alias)}'`;
        await pool.query(checkQuery);

        const detachQuery = `DETACH DATABASE ${toDuckDBIdentifier(alias)}`;
        await pool.query(detachQuery);
        await pool.query(buildDropSecretQuery(secretName));

        showSuccess({
          title: 'Connection successful',
          message: 'Iceberg catalog connection test passed',
        });
        return true;
      } catch (error) {
        const message = sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
        showError({
          title: 'Connection failed',
          message: `Failed to connect: ${message}`,
        });

        try {
          await pool.query(buildDropSecretQuery(secretName));
        } catch {
          // Best-effort cleanup
        }
        return false;
      } finally {
        setIsTesting(false);
      }
    },
    [pool, isTesting, isLoading],
  );

  const addCatalog = useCallback(
    async (params: IcebergConnectionParams, onClose: () => void): Promise<boolean> => {
      if (isLoading || isTesting || !pool) return false;

      setIsLoading(true);
      const alias = params.catalogAlias.trim();
      const isManagedEndpoint = isManagedIcebergEndpoint(params.endpointType);
      const effectiveAuthType = isManagedEndpoint ? 'sigv4' : params.authType;
      const secretName = generateSecretName(alias);

      try {
        const secretRefId = makeSecretId();
        const credentials = {
          authType: effectiveAuthType,
          clientId: params.clientId.trim() || undefined,
          clientSecret: params.clientSecret.trim() || undefined,
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          token: params.token.trim() || undefined,
          awsKeyId: params.awsKeyId.trim() || undefined,
          awsSecret: params.awsSecret.trim() || undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
        };

        const { _iDbConn } = useAppStore.getState();
        if (_iDbConn) {
          const payload = buildIcebergSecretPayload(`Iceberg: ${alias}`, credentials);
          await putSecret(_iDbConn, secretRefId, payload);
        }

        const catalog: IcebergCatalog = {
          type: 'iceberg-catalog',
          id: makePersistentDataSourceId(),
          catalogAlias: alias,
          warehouseName: params.warehouseName.trim(),
          endpoint: params.endpoint.trim(),
          authType: effectiveAuthType,
          connectionState: 'connecting',
          attachedAt: Date.now(),
          useCorsProxy: params.useCorsProxy,
          secretName,
          endpointType: isManagedEndpoint
            ? (params.endpointType as 'GLUE' | 'S3_TABLES')
            : undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          secretRef: secretRefId,
        };

        const { dataSources, databaseMetadata } = useAppStore.getState();
        const newDataSources = new Map(dataSources);
        newDataSources.set(catalog.id, catalog);

        const secretQuery = buildIcebergSecretQuery({
          secretName,
          authType: effectiveAuthType,
          useS3SecretType: isManagedEndpoint,
          clientId: params.clientId.trim(),
          clientSecret: params.clientSecret.trim(),
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          token: params.token.trim(),
          awsKeyId: params.awsKeyId.trim() || undefined,
          awsSecret: params.awsSecret.trim() || undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
        });
        await pool.query(secretQuery);

        const attachQuery = buildIcebergAttachQuery({
          warehouseName: catalog.warehouseName,
          catalogAlias: alias,
          endpoint: isManagedEndpoint ? undefined : catalog.endpoint,
          endpointType: catalog.endpointType,
          secretName,
          useCorsProxy: params.useCorsProxy,
        });
        await executeWithRetry(pool, attachQuery, {
          maxRetries: 3,
          timeout: 30000,
          retryDelay: 2000,
          exponentialBackoff: true,
        });

        const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${escapeSqlStringValue(alias)}'`;
        let dbFound = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!dbFound && attempts < maxAttempts) {
          try {
            const result = await pool.query(checkQuery);
            if (result && result.numRows > 0) {
              dbFound = true;
            } else {
              throw new Error('Catalog not found in duckdb_databases');
            }
          } catch (error) {
            attempts += 1;
            if (attempts >= maxAttempts) {
              throw new Error(
                `Catalog ${alias} could not be verified after ${maxAttempts} attempts`,
              );
            }
            console.warn(`Attempt ${attempts}: Catalog not ready yet, waiting...`);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        catalog.connectionState = 'connected';
        newDataSources.set(catalog.id, catalog);

        try {
          const remoteMetadata = await getDatabaseModel(pool, [alias]);
          const newMetadata = new Map(databaseMetadata);
          for (const [dbName, dbModel] of remoteMetadata) {
            newMetadata.set(dbName, dbModel);
          }
          useAppStore.setState(
            { dataSources: newDataSources, databaseMetadata: newMetadata },
            false,
            'DatasourceWizard/addIcebergCatalog',
          );
        } catch (metadataError) {
          console.error('Failed to load metadata:', metadataError);
          useAppStore.setState(
            { dataSources: newDataSources },
            false,
            'DatasourceWizard/addIcebergCatalog',
          );
        }

        const { _iDbConn: iDbConn } = useAppStore.getState();
        if (iDbConn) {
          await persistPutDataSources(iDbConn, [catalog]);
        }

        showSuccess({
          title: 'Catalog added',
          message: `Successfully connected to Iceberg catalog '${alias}'`,
        });
        onClose();
        return true;
      } catch (error) {
        const message = sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
        showError({
          title: 'Failed to add catalog',
          message: `Error: ${message}`,
        });

        try {
          await pool.query(buildDropSecretQuery(secretName));
        } catch {
          // Best-effort cleanup
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [pool, isLoading, isTesting],
  );

  return { isLoading, isTesting, testConnection, addCatalog };
}
```

**Step 2: Simplify iceberg-catalog-config.tsx to use the hook**

Replace the component to use the extracted hook. The component should now only handle form state and rendering. See the full replacement in the implementation — the key change is removing `handleTest`, `handleAdd`, `isLoading`, `isTesting` state from the component and using `useIcebergConnection` instead.

**Step 3: Run typecheck and lint**

Run: `yarn typecheck && yarn lint`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/features/datasource-wizard/hooks/use-iceberg-connection.ts src/features/datasource-wizard/components/iceberg-catalog-config.tsx
git commit -m "refactor: extract connection logic from IcebergCatalogConfig into useIcebergConnection hook"
```

---

### Summary of Issue-to-Task Mapping

| Issue # | Description | Task |
|---------|-------------|------|
| 1 | Orphan secrets on UI delete | Already fixed in current code (lines 199-209 of data-view-source.ts) |
| 2 | CREATE SECRET without ATTACH not persisted | Task 2 |
| 3 | Error message sanitization | Task 6 |
| 4 | Parsing limitations (quoted identifiers) | Task 1 |
| 5 | Web Crypto feature detection | Task 4 |
| 6 | Large component extraction | Task 12 |
| 7 | Duplicated isManagedEndpoint logic | Task 3 |
| 8 | Inconsistent error handling | Task 11 |
| 9 | Race condition in test/add flow | Task 7 |
| 10 | bufferToBase64 performance | Task 5 |
| 11 | Missing tests | Tasks 1, 2, 6, 10 |
| 12 | useIcebergCatalogNodes exhaustive-deps | Task 8 |
| 13 | Document crypto limitations | Task 9 |

Note: Issue #1 (orphan secrets on UI delete) was already addressed in the current code — `data-view-source.ts` lines 199-209 already delete `secretRef` from the store. The reviewers may have been looking at an earlier diff.
