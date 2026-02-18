import {
  __resetGsheetsBootstrapForTests,
  configureConnectionForHttpfs,
} from '@controllers/db/httpfs-extension-controller';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockConn = {
  query: jest.MockedFunction<(statement: string) => Promise<unknown>>;
};

const BASE_BOOTSTRAP_STATEMENTS = [
  'SET autoinstall_known_extensions = true',
  'INSTALL httpfs',
  'LOAD httpfs',
  'INSTALL iceberg',
  'LOAD iceberg',
];
const GSHEETS_HTTP_SCOPE_SQL =
  "'https://docs.google.com/spreadsheets/', 'https://sheets.googleapis.com/'";

function expectedHttpSecretStatement(
  token: string,
  secretName = 'pondpilot_gsheet_http',
): string {
  const escapedSecretName = secretName.replace(/"/g, '""');
  const escapedToken = token.replace(/'/g, "''");
  return `CREATE OR REPLACE SECRET "${escapedSecretName}" (TYPE HTTP, PROVIDER CONFIG, BEARER_TOKEN '${escapedToken}', SCOPE (${GSHEETS_HTTP_SCOPE_SQL}))`;
}

function createMockConn(): MockConn {
  return {
    query: jest.fn(async (_statement: string) => undefined),
  };
}

describe('configureConnectionForHttpfs', () => {
  let warnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    __resetGsheetsBootstrapForTests();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('bootstraps httpfs and iceberg extensions by default', async () => {
    const conn = createMockConn();

    await configureConnectionForHttpfs(conn as any);

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual(BASE_BOOTSTRAP_STATEMENTS);
  });

  it('treats iceberg load failure as non-fatal', async () => {
    const conn = createMockConn();
    conn.query.mockImplementation(async (statement: string) => {
      if (statement === 'LOAD iceberg') {
        throw new Error('Catalog Error: Extension not found');
      }
      return undefined;
    });

    await expect(configureConnectionForHttpfs(conn as any)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('throws when httpfs cannot be loaded', async () => {
    const conn = createMockConn();
    conn.query.mockImplementation(async (statement: string) => {
      if (statement === 'LOAD httpfs') {
        throw new Error('httpfs load failed');
      }
      return undefined;
    });

    await expect(configureConnectionForHttpfs(conn as any)).rejects.toThrow('httpfs load failed');
  });

  it('can install and load gsheets from community repository when enabled', async () => {
    const conn = createMockConn();

    await configureConnectionForHttpfs(conn as any, {
      enableGsheetsCommunity: true,
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      'INSTALL gsheets FROM community',
      'LOAD gsheets',
    ]);
  });

  it('skips gsheets LOAD when community install fails', async () => {
    const conn = createMockConn();
    conn.query.mockImplementation(async (statement: string) => {
      if (statement === 'INSTALL gsheets FROM community') {
        throw new Error('HTTP 404 while fetching extension');
      }
      return undefined;
    });

    await expect(
      configureConnectionForHttpfs(conn as any, {
        enableGsheetsCommunity: true,
      }),
    ).resolves.toBeUndefined();

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      'INSTALL gsheets FROM community',
    ]);
  });

  it('loads gsheets from explicit extension URL and skips community install/load', async () => {
    const conn = createMockConn();
    const extensionUrl = 'https://example.com/gsheets.duckdb_extension.wasm';

    await configureConnectionForHttpfs(conn as any, {
      enableGsheetsCommunity: true,
      gsheetsExtensionUrl: extensionUrl,
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      `LOAD '${extensionUrl}'`,
    ]);
  });

  it('creates gsheet access_token secret when token is provided with explicit extension URL', async () => {
    const conn = createMockConn();
    const extensionUrl = 'https://example.com/gsheets.duckdb_extension.wasm';

    await configureConnectionForHttpfs(conn as any, {
      gsheetsExtensionUrl: extensionUrl,
      gsheetsAccessToken: 'token-123',
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      expectedHttpSecretStatement('token-123'),
      `LOAD '${extensionUrl}'`,
      `CREATE OR REPLACE SECRET "pondpilot_gsheet" (TYPE gsheet, PROVIDER access_token, TOKEN 'token-123')`,
    ]);
  });

  it('creates gsheet + http access token secrets with custom names and escaped token', async () => {
    const conn = createMockConn();
    const extensionUrl = 'https://example.com/gsheets.duckdb_extension.wasm';

    await configureConnectionForHttpfs(conn as any, {
      gsheetsExtensionUrl: extensionUrl,
      gsheetsAccessToken: "tok'en",
      gsheetsSecretName: 'my "gsheet" secret',
      gsheetsHttpSecretName: 'my "http" secret',
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      expectedHttpSecretStatement("tok'en", 'my "http" secret'),
      `LOAD '${extensionUrl}'`,
      `CREATE OR REPLACE SECRET "my ""gsheet"" secret" (TYPE gsheet, PROVIDER access_token, TOKEN 'tok''en')`,
    ]);
  });

  it('creates gsheet access_token secret when community extension is enabled', async () => {
    const conn = createMockConn();

    await configureConnectionForHttpfs(conn as any, {
      enableGsheetsCommunity: true,
      gsheetsAccessToken: 'community-token',
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      expectedHttpSecretStatement('community-token'),
      'INSTALL gsheets FROM community',
      'LOAD gsheets',
      `CREATE OR REPLACE SECRET "pondpilot_gsheet" (TYPE gsheet, PROVIDER access_token, TOKEN 'community-token')`,
    ]);
  });

  it('creates only HTTP secret when token is provided but gsheets loading is disabled', async () => {
    const conn = createMockConn();

    await configureConnectionForHttpfs(conn as any, {
      gsheetsAccessToken: 'token-without-extension',
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      expectedHttpSecretStatement('token-without-extension'),
    ]);
  });

  it('keeps HTTP secret setup when gsheets extension URL fails to load', async () => {
    const conn = createMockConn();
    const extensionUrl = 'https://example.com/gsheets.duckdb_extension.wasm';
    conn.query.mockImplementation(async (statement: string) => {
      if (statement === `LOAD '${extensionUrl}'`) {
        throw new Error('dynamic lib load failed');
      }
      return undefined;
    });

    await configureConnectionForHttpfs(conn as any, {
      gsheetsExtensionUrl: extensionUrl,
      gsheetsAccessToken: 'resilient-token',
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      expectedHttpSecretStatement('resilient-token'),
      `LOAD '${extensionUrl}'`,
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
