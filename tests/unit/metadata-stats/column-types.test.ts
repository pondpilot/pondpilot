import { describe, expect, it } from '@jest/globals';

import {
  isNumericColumnType,
  isBooleanColumnType,
  isDateColumnType,
  shouldShowHistogram,
  parseNumericValue,
  sanitizeDisplayValue,
  createUserFriendlyErrorMessage,
  normalizeColumnType,
} from '../../../src/features/metadata-stats-view/utils/column-types';

describe('column-types utilities', () => {
  describe('isNumericColumnType', () => {
    it('should return true for numeric types', () => {
      expect(isNumericColumnType('INTEGER')).toBe(true);
      expect(isNumericColumnType('integer')).toBe(true);
      expect(isNumericColumnType('BIGINT')).toBe(true);
      expect(isNumericColumnType('DOUBLE')).toBe(true);
      expect(isNumericColumnType('REAL')).toBe(true);
      expect(isNumericColumnType('DECIMAL')).toBe(true);
      expect(isNumericColumnType('FLOAT')).toBe(true);
    });

    it('should return false for non-numeric types', () => {
      expect(isNumericColumnType('STRING')).toBe(false);
      expect(isNumericColumnType('BOOLEAN')).toBe(false);
      expect(isNumericColumnType('DATE')).toBe(false);
      expect(isNumericColumnType('')).toBe(false);
    });

    it('should handle invalid inputs', () => {
      expect(isNumericColumnType(null as any)).toBe(false);
      expect(isNumericColumnType(undefined as any)).toBe(false);
      expect(isNumericColumnType(123 as any)).toBe(false);
    });
  });

  describe('isBooleanColumnType', () => {
    it('should return true for boolean types', () => {
      expect(isBooleanColumnType('BOOLEAN')).toBe(true);
      expect(isBooleanColumnType('boolean')).toBe(true);
    });

    it('should return false for non-boolean types', () => {
      expect(isBooleanColumnType('INTEGER')).toBe(false);
      expect(isBooleanColumnType('STRING')).toBe(false);
      expect(isBooleanColumnType('')).toBe(false);
    });
  });

  describe('isDateColumnType', () => {
    it('should return true for date/time types', () => {
      expect(isDateColumnType('DATE')).toBe(true);
      expect(isDateColumnType('TIME')).toBe(true);
      expect(isDateColumnType('TIMESTAMP')).toBe(true);
      expect(isDateColumnType('DATETIME')).toBe(true);
      expect(isDateColumnType('TIMESTAMPTZ')).toBe(true);
    });

    it('should return false for non-date types', () => {
      expect(isDateColumnType('INTEGER')).toBe(false);
      expect(isDateColumnType('STRING')).toBe(false);
      expect(isDateColumnType('')).toBe(false);
    });
  });

  describe('shouldShowHistogram', () => {
    it('should return true for numeric, boolean, and date types', () => {
      expect(shouldShowHistogram('INTEGER')).toBe(true);
      expect(shouldShowHistogram('BOOLEAN')).toBe(true);
      expect(shouldShowHistogram('DATE')).toBe(true);
    });

    it('should return false for other types', () => {
      expect(shouldShowHistogram('STRING')).toBe(false);
      expect(shouldShowHistogram('BYTES')).toBe(false);
    });
  });

  describe('parseNumericValue', () => {
    it('should parse valid numeric values', () => {
      expect(parseNumericValue(123)).toBe(123);
      expect(parseNumericValue('456')).toBe(456);
      expect(parseNumericValue('123.45')).toBe(123.45);
      expect(parseNumericValue(0)).toBe(0);
      expect(parseNumericValue(-123)).toBe(-123);
    });

    it('should return null for invalid values', () => {
      expect(parseNumericValue(null)).toBe(null);
      expect(parseNumericValue(undefined)).toBe(null);
      expect(parseNumericValue('abc')).toBe(null);
      expect(parseNumericValue(NaN)).toBe(null);
      expect(parseNumericValue(Infinity)).toBe(null);
      expect(parseNumericValue(-Infinity)).toBe(null);
    });
  });

  describe('sanitizeDisplayValue', () => {
    it('should sanitize HTML tags', () => {
      expect(sanitizeDisplayValue('<script>alert("xss")</script>')).toBe('alert(&quot;xss&quot;)');
      expect(sanitizeDisplayValue('<div>content</div>')).toBe('content');
      expect(sanitizeDisplayValue('<img src="x" onerror="alert(1)">')).toBe('');
    });

    it('should escape dangerous characters', () => {
      expect(sanitizeDisplayValue('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#x27;');
      expect(sanitizeDisplayValue('normal text')).toBe('normal text');
    });

    it('should handle null/undefined values', () => {
      expect(sanitizeDisplayValue(null)).toBe('');
      expect(sanitizeDisplayValue(undefined)).toBe('');
    });

    it('should handle non-string values', () => {
      expect(sanitizeDisplayValue(123)).toBe('123');
      expect(sanitizeDisplayValue(true)).toBe('true');
      // DataValue doesn't include objects, so this test should use a string representation
      expect(sanitizeDisplayValue('[object Object]')).toBe('[object Object]');
    });
  });

  describe('createUserFriendlyErrorMessage', () => {
    it('should return error message in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error message');
      expect(createUserFriendlyErrorMessage(error)).toBe('Test error message');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return generic message in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error message');
      expect(createUserFriendlyErrorMessage(error)).toBe(
        'An error occurred while processing the data',
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle non-Error objects', () => {
      expect(createUserFriendlyErrorMessage('string error')).toBe('An unexpected error occurred');
      expect(createUserFriendlyErrorMessage(null)).toBe('An unexpected error occurred');
      expect(createUserFriendlyErrorMessage(undefined)).toBe('An unexpected error occurred');
    });
  });

  describe('normalizeColumnType', () => {
    it('should normalize numeric types', () => {
      expect(normalizeColumnType('INTEGER')).toBe('integer');
      expect(normalizeColumnType('BIGINT')).toBe('bigint');
      expect(normalizeColumnType('DECIMAL')).toBe('decimal');
      expect(normalizeColumnType('FLOAT')).toBe('float');
      expect(normalizeColumnType('DOUBLE')).toBe('float');
    });

    it('should normalize boolean types', () => {
      expect(normalizeColumnType('BOOLEAN')).toBe('boolean');
      expect(normalizeColumnType('BOOL')).toBe('boolean');
    });

    it('should normalize date/time types', () => {
      expect(normalizeColumnType('DATE')).toBe('date');
      expect(normalizeColumnType('TIMESTAMP')).toBe('timestamp');
      expect(normalizeColumnType('TIMESTAMPTZ')).toBe('timestamptz');
      expect(normalizeColumnType('TIME')).toBe('time');
      expect(normalizeColumnType('TIMETZ')).toBe('timetz');
    });

    it('should normalize string types', () => {
      expect(normalizeColumnType('VARCHAR')).toBe('string');
      expect(normalizeColumnType('TEXT')).toBe('string');
      expect(normalizeColumnType('CHAR')).toBe('string');
    });

    it('should return "other" for unknown types', () => {
      expect(normalizeColumnType('UNKNOWN_TYPE')).toBe('other');
      expect(normalizeColumnType('')).toBe('other');
      expect(normalizeColumnType(null as any)).toBe('other');
      expect(normalizeColumnType(undefined as any)).toBe('other');
    });
  });
});
