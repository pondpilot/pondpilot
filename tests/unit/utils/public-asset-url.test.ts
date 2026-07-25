import { describe, expect, it } from '@jest/globals';
import { resolvePublicAssetUrl } from '@utils/public-asset-url';

describe('resolvePublicAssetUrl', () => {
  it('keeps public assets beneath the Vite base path', () => {
    expect(
      resolvePublicAssetUrl(
        '/duckdb-extensions/gsheets/gsheets.duckdb_extension.wasm',
        '/pondpilot/',
        'https://example.com',
      ),
    ).toBe('https://example.com/pondpilot/duckdb-extensions/gsheets/gsheets.duckdb_extension.wasm');
  });

  it('preserves absolute extension URLs', () => {
    expect(
      resolvePublicAssetUrl(
        'https://cdn.example.com/gsheets.wasm',
        '/pondpilot/',
        'https://example.com',
      ),
    ).toBe('https://cdn.example.com/gsheets.wasm');
  });

  it('returns an empty string for an unset URL', () => {
    expect(resolvePublicAssetUrl('', '/pondpilot/', 'https://example.com')).toBe('');
  });
});
