import { describe, expect, it, jest } from '@jest/globals';
import {
  detectQuackRidgePlatform,
  buildQuackRidgeQuery,
  fetchQuackRidgeReleaseManifest,
  findQuackRidgeLocalReference,
  getQuackRidgeDatabaseModel,
  identifyQuackRidge,
  makeQuackRidgeConnection,
  mapQuackRidgeError,
  pairWithQuackRidge,
  QUACKRIDGE_RELEASE_MANIFEST_URL,
  selectQuackRidgeAsset,
  validatePairingChallengeUrl,
  validateQuackRidgeIdentity,
  validateQuackRidgePairingResponse,
  validateQuackRidgeReleaseManifest,
} from '@utils/quackridge';

import * as identityFixture from '../../../src/protocol/quackridge/v1/fixtures/identity.valid.json';
import * as pairingFixture from '../../../src/protocol/quackridge/v1/fixtures/pairing.valid.json';

const manifestFixture = {
  version: '0.1.0',
  channel: 'prerelease',
  protocol: { minimum: 1, maximum: 1 },
  assets: [
    {
      os: 'darwin',
      arch: 'arm64',
      url: 'https://github.com/pondpilot/quackridge/releases/download/v0.1.0/quackridge-darwin-arm64.zip',
      sha256: 'a'.repeat(64),
      signature: 'minisign-signature',
      minimum_os: '13.0',
    },
  ],
};

describe('QuackRidge protocol', () => {
  it('accepts the pinned identity fixture and rejects generic Quack', () => {
    expect(validateQuackRidgeIdentity(identityFixture).product).toBe('quackridge');
    expect(() => validateQuackRidgeIdentity({ ...identityFixture, product: 'quack' })).toThrow(
      'not QuackRidge',
    );
  });

  it('fails closed when a required capability is absent', () => {
    expect(() =>
      validateQuackRidgeIdentity({
        ...identityFixture,
        capabilities: identityFixture.capabilities.slice(1),
      }),
    ).toThrow('required v1 capabilities');
  });

  it('validates pairing responses and local-only endpoints', () => {
    expect(validateQuackRidgePairingResponse(pairingFixture).endpoint).toBe('quack:127.0.0.1:9494');
    expect(() =>
      validateQuackRidgePairingResponse({ ...pairingFixture, endpoint: 'quack:example.com:9494' }),
    ).toThrow('local loopback');
  });

  it('only accepts temporary loopback pairing URLs', () => {
    expect(validatePairingChallengeUrl('http://127.0.0.1:1234/v1/pair').port).toBe('1234');
    expect(() => validatePairingChallengeUrl('https://example.com/v1/pair')).toThrow(
      'temporary QuackRidge loopback URL',
    );
  });

  it('posts the one-time nonce without credentials and handles expiry', async () => {
    const fetcher = jest.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify(pairingFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(
      pairWithQuackRidge('http://localhost:1234/v1/pair', '0123456789abcdef', fetcher),
    ).resolves.toMatchObject({ endpoint: pairingFixture.endpoint });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'error' }),
    );

    fetcher.mockResolvedValueOnce(new Response('', { status: 410 }));
    await expect(
      pairWithQuackRidge('http://localhost:1234/v1/pair', '0123456789abcdef', fetcher),
    ).rejects.toThrow('expired');
  });

  it('validates signed manifest fields and selects supported assets', () => {
    const manifest = validateQuackRidgeReleaseManifest(manifestFixture);
    expect(selectQuackRidgeAsset(manifest, { os: 'darwin', arch: 'arm64' })?.signature).toBe(
      'minisign-signature',
    );
    expect(selectQuackRidgeAsset(manifest, { os: 'linux', arch: 'arm64' })).toBeNull();
    expect(() =>
      validateQuackRidgeReleaseManifest({
        ...manifestFixture,
        assets: [{ ...manifestFixture.assets[0], sha256: 'not-a-hash' }],
      }),
    ).toThrow('invalid asset');
  });

  it('loads the release manifest through the same-origin Cloudflare endpoint', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(manifestFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      fetchQuackRidgeReleaseManifest(QUACKRIDGE_RELEASE_MANIFEST_URL, fetcher),
    ).resolves.toMatchObject({ version: '0.1.0' });
    expect(fetcher).toHaveBeenCalledWith(
      new URL(QUACKRIDGE_RELEASE_MANIFEST_URL, 'https://app.pondpilot.io'),
      expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'error' }),
    );
  });

  it('detects architecture only when browser evidence is sufficient', async () => {
    const detected = await detectQuackRidgePlatform({
      platform: 'macOS',
      userAgent: 'Mozilla/5.0',
      userAgentData: {
        platform: 'macOS',
        getHighEntropyValues: async () => ({ architecture: 'arm', bitness: '64' }),
      },
    } as unknown as Navigator);
    expect(detected).toEqual({ os: 'darwin', arch: 'arm64' });

    await expect(
      detectQuackRidgePlatform({ platform: 'MacIntel', userAgent: 'Mozilla/5.0' } as Navigator),
    ).resolves.toBeNull();
  });

  it('reads and validates identity through whoami()', async () => {
    const pool = {
      query: jest.fn<(sql: string) => Promise<any>>().mockResolvedValue({
        numRows: 1,
        getChild: (name: string) => ({
          get: () => (name === 'name' ? 'QuackRidge' : JSON.stringify(identityFixture)),
        }),
      }),
    };
    await expect(identifyQuackRidge(pool as any, 'ridge')).resolves.toMatchObject({
      product: 'quackridge',
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("ridge.query('FROM whoami()')"),
    );
  });

  it('normalizes Arrow struct rows before validating identity', async () => {
    class ArrowStructRow {
      toJSON() {
        return identityFixture;
      }
    }
    const pool = {
      query: jest.fn<(sql: string) => Promise<any>>().mockResolvedValue({
        numRows: 1,
        getChild: (name: string) => ({
          get: () => (name === 'name' ? 'QuackRidge' : new ArrowStructRow()),
        }),
      }),
    };

    await expect(identifyQuackRidge(pool as any, 'ridge')).resolves.toMatchObject({
      product: 'quackridge',
      protocol_version: 1,
    });
  });

  it('accepts Quack fixed whoami fields for the validated v1 contract', async () => {
    const pool = {
      query: jest.fn<(sql: string) => Promise<any>>().mockResolvedValue({
        numRows: 1,
        getChild: (name: string) => ({
          get: () =>
            name === 'name'
              ? 'QuackRidge'
              : {
                  duckdb_version: 'v1.5.5',
                  platform: 'linux_amd64',
                  product: 'quackridge',
                  product_version: '0.1.0-dev',
                  protocol_version: 1,
                },
        }),
      }),
    };

    await expect(identifyQuackRidge(pool as any, 'ridge')).resolves.toMatchObject({
      metadata_version: 1,
      capabilities: expect.arrayContaining(['cancellation_noop', 'metadata_v1']),
    });
  });

  it('persists only an encrypted secret reference, never the token', () => {
    const connection = makeQuackRidgeConnection({
      endpoint: pairingFixture.endpoint,
      alias: 'ridge',
      identity: validateQuackRidgeIdentity(identityFixture),
      secretRef: 'secret-id' as any,
    });
    expect(connection).toMatchObject({ type: 'quackridge', secretRef: 'secret-id' });
    expect(JSON.stringify(connection)).not.toContain(pairingFixture.token);
  });

  it('wraps each complete statement once with a correlation ID', () => {
    expect(buildQuackRidgeQuery('my-ridge', "SELECT 'it''s ok'", 'pp_query-1')).toBe(
      `SELECT * FROM "my-ridge".query('/* quackridge-query-id:pp_query-1 */ SELECT ''it''''s ok''')`,
    );
    expect(() => buildQuackRidgeQuery('ridge', 'SELECT 1', 'unsafe id')).toThrow(
      'query ID is invalid',
    );
    expect(buildQuackRidgeQuery('ridge', 'SELECT 1;', 'with-semicolon')).not.toContain("1;')");
  });

  it('rejects explicit browser-local cross-engine references', () => {
    expect(findQuackRidgeLocalReference('SELECT * FROM pondpilot.main.orders', ['pondpilot'])).toBe(
      'pondpilot',
    );
    expect(
      findQuackRidgeLocalReference('SELECT * FROM warehouse.orders', ['pondpilot']),
    ).toBeNull();
  });

  it('maps stable server errors without retaining secret-bearing context', () => {
    const mapped = mapQuackRidgeError(
      new Error("QR_AUTHENTICATION while using TOKEN 'do-not-display-this'"),
    );
    expect(mapped).toContain('authentication failed');
    expect(mapped).not.toContain('do-not-display-this');
    expect(mapQuackRidgeError(new Error('Invalid Input Error: Authorization failed'))).toContain(
      'read-only policy',
    );
  });

  it('maps the stable metadata contract into catalog-scoped explorer schemas', async () => {
    const rows = [
      {
        source_id: 'warehouse-source',
        source_name: 'Warehouse',
        source_type: 'postgres',
        source_health: 'ready',
        catalog_name: 'warehouse',
        schema_name: 'sales',
        object_name: 'orders',
        object_type: 'table',
        column_name: 'id',
        ordinal_position: 1,
        duckdb_type: 'UUID',
        nullable: false,
        error_code: null,
      },
      {
        source_id: 'support-source',
        source_name: 'Customer Support',
        source_type: 'postgres',
        source_health: 'ready',
        catalog_name: 'support',
        schema_name: 'helpdesk',
        object_name: 'tickets',
        object_type: 'table',
        column_name: 'subject',
        ordinal_position: 1,
        duckdb_type: 'VARCHAR',
        nullable: true,
        error_code: null,
      },
      {
        source_id: 'offline',
        source_name: 'Offline',
        source_type: 'postgres',
        source_health: 'unavailable',
        catalog_name: 'offline',
        schema_name: null,
        object_name: null,
        object_type: null,
        column_name: null,
        ordinal_position: null,
        duckdb_type: null,
        nullable: null,
        error_code: 'QR_SOURCE_UNAVAILABLE',
      },
    ];
    const pool = {
      query: jest.fn<(sql: string) => Promise<any>>().mockResolvedValue({
        numRows: rows.length,
        getChild: (name: keyof (typeof rows)[number]) => ({
          get: (index: number) => rows[index][name],
        }),
      }),
    };
    const metadata = await getQuackRidgeDatabaseModel(pool as any, 'ridge');
    expect(metadata.get('qr:ridge:warehouse')).toMatchObject({
      name: 'warehouse',
      sourceId: 'warehouse-source',
      sourceType: 'postgres',
      schemas: [
        {
          name: 'sales',
          objects: [{ name: 'orders', columns: [{ name: 'id', nullable: false }] }],
        },
      ],
    });
    expect(metadata.get('qr:ridge:support')).toMatchObject({
      sourceType: 'postgres',
      schemas: [{ name: 'helpdesk', objects: [{ name: 'tickets' }] }],
    });
    expect(metadata.get('qr:ridge:offline')).toMatchObject({
      sourceHealth: 'unavailable',
      sourceErrorCode: 'QR_SOURCE_UNAVAILABLE',
      schemas: [],
    });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('quackridge_metadata_v1'));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("'information_schema'"));
  });
});
