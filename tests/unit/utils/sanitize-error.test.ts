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

  it('should redact PASSWORD values', () => {
    const msg = "Error: PASSWORD 'hunter2' is too short";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('hunter2');
    expect(result).toContain('PASSWORD [REDACTED]');
  });

  it('should redact API_KEY values', () => {
    const msg = "Invalid API_KEY 'sk-abc123xyz'";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('sk-abc123xyz');
    expect(result).toContain('API_KEY [REDACTED]');
  });

  it('should redact ACCESS_TOKEN values', () => {
    const msg = "ACCESS_TOKEN 'eyJhbG.payload.sig' expired at 12:00";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('eyJhbG.payload.sig');
    expect(result).toContain('ACCESS_TOKEN [REDACTED]');
  });

  it('should redact REFRESH_TOKEN values', () => {
    const msg = "Error refreshing: REFRESH_TOKEN 'rt-secret-value' invalid";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('rt-secret-value');
    expect(result).toContain('REFRESH_TOKEN [REDACTED]');
  });

  it('should handle empty strings', () => {
    expect(sanitizeErrorMessage('')).toBe('');
  });
});
