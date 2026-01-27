import { describe, it, expect } from '@jest/globals';
import { sanitizeErrorMessage } from '@utils/error-sanitizer';

describe('sanitizeErrorMessage', () => {
  describe('API key and token redaction', () => {
    it('should redact Bearer tokens', () => {
      const message = 'Error: Bearer sk-abc123xyz789 is invalid';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Error: bearer [REDACTED] is invalid');
      expect(result).not.toContain('sk-abc123xyz789');
    });

    it('should redact Bearer tokens case-insensitively', () => {
      const message = 'BEARER token123 failed';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('bearer [REDACTED] failed');
    });

    it('should redact JWT-style Bearer tokens with dots', () => {
      const message = 'Authorization: Bearer header.payload.signature failed';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Authorization: bearer [REDACTED] failed');
      expect(result).not.toContain('header.payload.signature');
    });

    it('should redact OpenAI-style API keys (sk-)', () => {
      const message = 'Invalid key: sk-proj-abc123XYZ789-test';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Invalid key: [REDACTED]');
      expect(result).not.toContain('sk-');
    });

    it('should redact multiple sk- keys in same message', () => {
      const message = 'Keys sk-first123 and sk-second456 are both invalid';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Keys [REDACTED] and [REDACTED] are both invalid');
    });

    it('should redact x-api-key header patterns', () => {
      const message = 'Header x-api-key: secret-key-12345 was rejected';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Header x-api-key [REDACTED] was rejected');
      expect(result).not.toContain('secret-key-12345');
    });

    it('should redact x-api-key with space separator', () => {
      const message = 'x-api-key my-secret-key-value invalid';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('x-api-key [REDACTED] invalid');
    });

    it('should handle multiple different key types', () => {
      const message = 'Bearer token123 with x-api-key: key456 and sk-abc789';
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('token123');
      expect(result).not.toContain('key456');
      expect(result).not.toContain('sk-abc789');
    });
  });

  describe('file path redaction', () => {
    it('should redact JavaScript file paths', () => {
      const message = 'Error at /home/user/project/src/utils/helper.js:42';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Error at [path]:42');
      expect(result).not.toContain('/home/user');
    });

    it('should redact TypeScript file paths', () => {
      const message = 'Failed in /app/src/components/Button.tsx';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Failed in [path]');
    });

    it('should redact .ts file paths', () => {
      const message = 'Error: /Users/dev/project/index.ts crashed';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Error: [path] crashed');
    });

    it('should redact .jsx file paths', () => {
      const message = 'Component /src/App.jsx failed to render';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Component [path] failed to render');
    });

    it('should redact nested paths', () => {
      const message = 'In /very/deeply/nested/path/to/file.ts:100:20';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('In [path]:100:20');
    });

    it('should redact multiple paths', () => {
      const message = 'Error in /src/a.ts and /src/b.js';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Error in [path] and [path]');
    });
  });

  describe('stack trace removal', () => {
    it('should remove simple stack trace lines', () => {
      const message = 'Error occurred at processRequest (/app/server.js:42)';
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('at processRequest');
    });

    it('should remove stack traces with anonymous functions', () => {
      const message = 'Failed at <anonymous> (/app/index.js:10)';
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('at <anonymous>');
    });

    it('should remove multiple stack trace lines', () => {
      const message = `Error: Something broke
        at functionA (/path/a.js:1)
        at functionB (/path/b.js:2)
        at functionC (/path/c.js:3)`;
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('at functionA');
      expect(result).not.toContain('at functionB');
      expect(result).not.toContain('at functionC');
    });

    it('should preserve the main error message', () => {
      const message = 'TypeError: Cannot read property at Object.method (/file.js:1)';
      const result = sanitizeErrorMessage(message);
      expect(result).toContain('TypeError: Cannot read property');
    });
  });

  describe('message truncation', () => {
    it('should truncate messages longer than 500 characters', () => {
      const longMessage = 'A'.repeat(600);
      const result = sanitizeErrorMessage(longMessage);
      expect(result.length).toBe(500);
    });

    it('should not truncate messages under 500 characters', () => {
      const shortMessage = 'Short error message';
      const result = sanitizeErrorMessage(shortMessage);
      expect(result).toBe('Short error message');
    });

    it('should truncate after other sanitization', () => {
      const message = `Error: sk-${'a'.repeat(600)}`;
      const result = sanitizeErrorMessage(message);
      // After redaction, should be "Error: [REDACTED]" which is short
      expect(result.length).toBeLessThanOrEqual(500);
      expect(result).not.toContain('sk-');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = sanitizeErrorMessage('');
      expect(result).toBe('');
    });

    it('should handle message with no sensitive data', () => {
      const message = 'Connection timeout after 30 seconds';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Connection timeout after 30 seconds');
    });

    it('should handle message with only whitespace', () => {
      const result = sanitizeErrorMessage('   ');
      expect(result).toBe('   ');
    });

    it('should handle null-like strings', () => {
      const result = sanitizeErrorMessage('null');
      expect(result).toBe('null');
    });

    it('should handle message with special characters', () => {
      const message = 'Error: "Something" went wrong! @ #$%^&*()';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Error: "Something" went wrong! @ #$%^&*()');
    });

    it('should handle newlines in message', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      const result = sanitizeErrorMessage(message);
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });
  });

  describe('real-world error scenarios', () => {
    it('should sanitize OpenAI API error with key', () => {
      const message =
        'OpenAI API error: Invalid API key provided: sk-proj-abc123. You can find your API key at https://platform.openai.com.';
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('sk-proj-abc123');
      expect(result).toContain('OpenAI API error');
    });

    it('should sanitize Anthropic API error', () => {
      const message =
        'Anthropic request failed with x-api-key: sk-ant-api123-xyz at /app/src/services/anthropic.ts:42';
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('sk-ant-api123-xyz');
      expect(result).not.toContain('/app/src/services');
    });

    it('should sanitize fetch error with Bearer token', () => {
      const message =
        'Fetch failed: Request with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test returned 401';
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result).toContain('returned 401');
    });

    it('should sanitize proxy error with internal path', () => {
      const message =
        'Proxy error in /home/ubuntu/polly-proxy/src/handlers/auth.ts: Rate limit exceeded';
      const result = sanitizeErrorMessage(message);
      expect(result).not.toContain('/home/ubuntu');
      expect(result).toContain('Rate limit exceeded');
    });
  });
});
