import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { describe, expect, it } from 'vitest';

describe('pure helper migration contract', () => {
  it('[pilot:pure.normal-message] preserves ordinary messages', () => {
    expect(sanitizeErrorMessage('Connection refused')).toBe('Connection refused');
  });

  it('[pilot:pure.secret-redaction] redacts CREATE SECRET contents', () => {
    const result = sanitizeErrorMessage(
      "Error in CREATE SECRET cloud (TYPE s3, KEY_ID 'AKID', SECRET 'skey')",
    );

    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('AKID');
    expect(result).not.toContain('skey');
  });

  it('[pilot:pure.token-redaction] redacts access tokens', () => {
    expect(sanitizeErrorMessage("ACCESS_TOKEN 'secret-token' expired")).toBe(
      'ACCESS_TOKEN [REDACTED] expired',
    );
  });
});
