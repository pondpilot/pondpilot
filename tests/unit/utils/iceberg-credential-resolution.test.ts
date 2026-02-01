/* eslint-disable import/order -- Module-under-test import must come after jest.mock calls for proper mock hoisting */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { IcebergCatalog, PersistentDataSourceId } from '@models/data-source';

import type { SecretId, SecretPayload } from '../../../src/services/secret-store';

// Mock secret store
const mockGetSecret = jest.fn<(iDb: any, id: SecretId) => Promise<SecretPayload | null>>();

jest.mock('@services/secret-store', () => ({
  getSecret: (...args: unknown[]) => mockGetSecret(...(args as [any, SecretId])),
}));

// eslint-disable-next-line import/first
import { resolveIcebergCredentials } from '@utils/iceberg-catalog';

function makeCatalog(overrides: Partial<IcebergCatalog> = {}): IcebergCatalog {
  return {
    type: 'iceberg-catalog',
    id: 'test-id' as PersistentDataSourceId,
    catalogAlias: 'test_catalog',
    warehouseName: 'wh',
    endpoint: 'https://example.com',
    authType: 'oauth2',
    connectionState: 'connected',
    attachedAt: Date.now(),
    secretName: 'test_secret',
    ...overrides,
  };
}

const fakeIDb = { fake: true } as any;

describe('resolveIcebergCredentials', () => {
  beforeEach(() => {
    mockGetSecret.mockReset();
  });

  it('should resolve credentials from the secret store when secretRef is set', async () => {
    const secretRef = 'secret-ref-123' as SecretId;
    mockGetSecret.mockResolvedValue({
      label: 'Iceberg: test_catalog',
      data: {
        authType: 'oauth2',
        clientId: 'from-store-id',
        clientSecret: 'from-store-secret',
        oauth2ServerUri: 'https://auth.example.com/token',
      },
    });

    const catalog = makeCatalog({ secretRef });
    const result = await resolveIcebergCredentials(fakeIDb, catalog);

    expect(result).not.toBeNull();
    expect(result?.authType).toBe('oauth2');
    expect(result?.clientId).toBe('from-store-id');
    expect(result?.clientSecret).toBe('from-store-secret');
    expect(result?.oauth2ServerUri).toBe('https://auth.example.com/token');

    expect(mockGetSecret).toHaveBeenCalledWith(fakeIDb, secretRef);
  });

  it('should fall back to inline fields when secretRef decryption fails', async () => {
    const secretRef = 'lost-key-ref' as SecretId;
    mockGetSecret.mockResolvedValue(null);

    const catalog = makeCatalog({
      secretRef,
      authType: 'bearer',
      token: 'inline-token',
    });
    const result = await resolveIcebergCredentials(fakeIDb, catalog);

    expect(result).not.toBeNull();
    expect(result?.authType).toBe('bearer');
    expect(result?.token).toBe('inline-token');
  });

  it('should resolve from inline fields when no secretRef is set', async () => {
    const catalog = makeCatalog({
      authType: 'sigv4',
      awsKeyId: 'AKIA1234',
      awsSecret: 'secret-key',
      defaultRegion: 'us-west-2',
    });

    const result = await resolveIcebergCredentials(fakeIDb, catalog);

    expect(result).not.toBeNull();
    expect(result?.authType).toBe('sigv4');
    expect(result?.awsKeyId).toBe('AKIA1234');
    expect(result?.awsSecret).toBe('secret-key');
    expect(result?.defaultRegion).toBe('us-west-2');

    // Should not call getSecret when there's no secretRef
    expect(mockGetSecret).not.toHaveBeenCalled();
  });

  it('should return null when authType is none and no credentials exist', async () => {
    const catalog = makeCatalog({
      authType: 'none',
      clientId: undefined,
      clientSecret: undefined,
      token: undefined,
      awsKeyId: undefined,
    });

    const result = await resolveIcebergCredentials(fakeIDb, catalog);
    expect(result).toBeNull();
  });

  it('should return null when auth type is set but no inline credentials exist and no secretRef', async () => {
    const catalog = makeCatalog({
      authType: 'oauth2',
      clientId: undefined,
      clientSecret: undefined,
      token: undefined,
      awsKeyId: undefined,
    });

    const result = await resolveIcebergCredentials(fakeIDb, catalog);
    expect(result).toBeNull();
  });

  it('should prefer secretRef over inline fields', async () => {
    const secretRef = 'preferred-ref' as SecretId;
    mockGetSecret.mockResolvedValue({
      label: 'Iceberg: test_catalog',
      data: {
        authType: 'oauth2',
        clientId: 'store-id',
        clientSecret: 'store-secret',
      },
    });

    const catalog = makeCatalog({
      secretRef,
      clientId: 'inline-id',
      clientSecret: 'inline-secret',
    });

    const result = await resolveIcebergCredentials(fakeIDb, catalog);
    expect(result?.clientId).toBe('store-id');
    expect(result?.clientSecret).toBe('store-secret');
  });
});
