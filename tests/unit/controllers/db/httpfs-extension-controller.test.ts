import {
  __resetGsheetsBootstrapForTests,
  configureConnectionForHttpfs,
} from '@controllers/db/httpfs-extension-controller';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockConn = {
  query: jest.MockedFunction<(statement: string) => Promise<unknown>>;
  bindings?: object;
};

const BASE_BOOTSTRAP_STATEMENTS = [
  'SET autoinstall_known_extensions = true',
  'INSTALL httpfs',
  'LOAD httpfs',
  'INSTALL iceberg',
  'LOAD iceberg',
];

function createMockConn(bindings?: object): MockConn {
  return {
    query: jest.fn(async (_statement: string) => undefined),
    bindings,
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

  it('loads gsheets from explicit extension URL for each connection on same DB instance', async () => {
    const sharedBindings = {};
    const connA = createMockConn(sharedBindings);
    const connB = createMockConn(sharedBindings);
    const extensionUrl = 'https://example.com/gsheets.duckdb_extension.wasm';

    await configureConnectionForHttpfs(connA as any, {
      gsheetsExtensionUrl: extensionUrl,
    });
    await configureConnectionForHttpfs(connB as any, {
      gsheetsExtensionUrl: extensionUrl,
    });

    expect(connA.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      `LOAD '${extensionUrl}'`,
    ]);
    expect(connB.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      `LOAD '${extensionUrl}'`,
    ]);
  });

  it('installs gsheets once and loads gsheets on each connection for community mode', async () => {
    const sharedBindings = {};
    const connA = createMockConn(sharedBindings);
    const connB = createMockConn(sharedBindings);

    await configureConnectionForHttpfs(connA as any, {
      enableGsheetsCommunity: true,
    });
    await configureConnectionForHttpfs(connB as any, {
      enableGsheetsCommunity: true,
    });

    expect(connA.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      'INSTALL gsheets FROM community',
      'LOAD gsheets',
    ]);
    expect(connB.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      'LOAD gsheets',
    ]);
  });

  it('warns when gsheets extension URL fails to load', async () => {
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
    });

    expect(conn.query.mock.calls.map((call) => call[0])).toEqual([
      ...BASE_BOOTSTRAP_STATEMENTS,
      `LOAD '${extensionUrl}'`,
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
