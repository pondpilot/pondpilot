import { describe, it, expect } from '@jest/globals';

import { fuzzyMatch } from '../../../../../src/features/data-explorer/utils/fuzzy-search';

describe('fuzzyMatch', () => {
  describe('exact substring matching', () => {
    it('should match exact substrings', () => {
      expect(fuzzyMatch('ass', 'assets')).toBe(true);
      expect(fuzzyMatch('ass', 'class')).toBe(true);
      expect(fuzzyMatch('ass', 'assignment')).toBe(true);
    });

    it('should not match when characters are not consecutive', () => {
      expect(fuzzyMatch('ass', 'address')).toBe(false);
      expect(fuzzyMatch('ass', 'transaction')).toBe(false);
      expect(fuzzyMatch('ass', 'analysis')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(fuzzyMatch('CSV', 'test.csv')).toBe(true);
      expect(fuzzyMatch('csv', 'TEST.CSV')).toBe(true);
      expect(fuzzyMatch('data', 'MyDatabase')).toBe(true);
      expect(fuzzyMatch('DATA', 'mydatabase')).toBe(true);
    });
  });

  describe('short queries (1-2 chars)', () => {
    it('should only do substring matching for single character', () => {
      expect(fuzzyMatch('a', 'apple')).toBe(true);
      expect(fuzzyMatch('a', 'banana')).toBe(true);
      expect(fuzzyMatch('z', 'azure')).toBe(true);
      expect(fuzzyMatch('z', 'example')).toBe(false);
    });

    it('should only do substring matching for two characters', () => {
      expect(fuzzyMatch('ab', 'about')).toBe(true);
      expect(fuzzyMatch('ab', 'table')).toBe(true);
      expect(fuzzyMatch('ab', 'a boy')).toBe(false); // not consecutive
      expect(fuzzyMatch('xy', 'x_y')).toBe(false); // not consecutive
    });
  });

  describe('word boundary matching', () => {
    it('should match at word start after common separators', () => {
      expect(fuzzyMatch('test', 'my-test-file')).toBe(true);
      expect(fuzzyMatch('test', 'my_test_file')).toBe(true);
      expect(fuzzyMatch('test', 'my.test.file')).toBe(true);
      expect(fuzzyMatch('test', 'my/test/file')).toBe(true);
      expect(fuzzyMatch('test', 'my\\test\\file')).toBe(true);
      expect(fuzzyMatch('test', 'my test file')).toBe(true);
    });

    it('should match substrings even in middle of words', () => {
      // The algorithm does substring matching first, so these will match
      expect(fuzzyMatch('test', 'contest')).toBe(true);
      expect(fuzzyMatch('test', 'latest')).toBe(true);
      // But word boundary matching is checked for non-substring matches
      expect(fuzzyMatch('data', 'metadata')).toBe(true); // substring match
    });
  });

  describe('proximity-based fuzzy matching', () => {
    it('should match when characters are within maxGap distance', () => {
      // With maxGap of 3, these should match
      expect(fuzzyMatch('tst', 'test')).toBe(true); // t_st (gap of 1)
      expect(fuzzyMatch('tbl', 'table')).toBe(true); // t_bl_ (gaps of 1,1)
      expect(fuzzyMatch('usr', 'user')).toBe(true); // us_r (gap of 1)
    });

    it('should not match when characters are too far apart', () => {
      // These have gaps larger than 3
      expect(fuzzyMatch('tx', 'table_x')).toBe(false); // t____x (gap > 3)
      expect(fuzzyMatch('az', 'abcdefz')).toBe(false); // a_____z (gap > 3)
    });

    it('should reset and retry when gap is too large', () => {
      // This tests the reset logic - first 'a' is too far from 's',
      // but second 'a' in 'class' should work
      expect(fuzzyMatch('ass', 'a_long_class')).toBe(true);
    });
  });

  describe('empty and edge cases', () => {
    it('should return true for empty query', () => {
      expect(fuzzyMatch('', 'anything')).toBe(true);
      expect(fuzzyMatch('', '')).toBe(true);
    });

    it('should handle null/undefined targets gracefully', () => {
      expect(fuzzyMatch('test', null as any)).toBe(false);
      expect(fuzzyMatch('test', undefined as any)).toBe(false);
    });

    it('should handle numeric targets', () => {
      // Numbers are primitives but typeof number is 'number', not 'string' or 'object'
      // So they go to else branch: String(target || '')
      expect(fuzzyMatch('123', 123 as any)).toBe(true);
      expect(fuzzyMatch('42', 42 as any)).toBe(true);
      expect(fuzzyMatch('42', 24 as any)).toBe(false);
    });
  });

  describe('non-string target handling', () => {
    it('should return false for plain objects', () => {
      // Objects go through extractTextFromElement which returns empty string
      const obj = { toString: () => 'Hello World' };
      expect(fuzzyMatch('hello', obj)).toBe(false);
      expect(fuzzyMatch('', obj)).toBe(true); // empty query always matches
    });

    it('should handle non-React objects as empty strings', () => {
      // Without React's isValidElement, objects return empty string from extractTextFromElement
      const element = {
        props: { children: 'Hello World' },
      };
      expect(fuzzyMatch('object', element)).toBe(false);
      expect(fuzzyMatch('', element)).toBe(true);
    });

    it('should handle boolean values', () => {
      // Booleans go to else branch: String(target || '')
      expect(fuzzyMatch('true', true as any)).toBe(true);
      // false || '' evaluates to '', so String('') = ''
      expect(fuzzyMatch('false', false as any)).toBe(false);
      expect(fuzzyMatch('', false as any)).toBe(true); // empty query matches
      // 0 also becomes empty string because 0 || '' = ''
      expect(fuzzyMatch('0', 0 as any)).toBe(false);
      expect(fuzzyMatch('', 0 as any)).toBe(true);
    });
  });

  describe('special characters', () => {
    it('should handle special characters in query', () => {
      expect(fuzzyMatch('.csv', 'file.csv')).toBe(true);
      expect(fuzzyMatch('[DB]', '[DB] test')).toBe(true);
      expect(fuzzyMatch('test()', 'test()')).toBe(true);
    });

    it('should handle unicode characters', () => {
      expect(fuzzyMatch('café', 'café')).toBe(true);
      expect(fuzzyMatch('🚀', 'rocket 🚀')).toBe(true);
      expect(fuzzyMatch('über', 'über-file')).toBe(true);
    });
  });

  describe('real-world scenarios', () => {
    it('should match file names effectively', () => {
      expect(fuzzyMatch('trans', 'transactions.csv')).toBe(true);
      expect(fuzzyMatch('cust', 'customer_orders')).toBe(true); // substring match
      expect(fuzzyMatch('inv', 'invoices')).toBe(true);
      expect(fuzzyMatch('chinook', 'chinook.db')).toBe(true);
    });

    it('should match database objects', () => {
      expect(fuzzyMatch('emp', 'employees')).toBe(true);
      expect(fuzzyMatch('addr', 'address')).toBe(true);
      expect(fuzzyMatch('billing', 'billing_address')).toBe(true); // word boundary
    });

    it('should distinguish similar names with our stricter algorithm', () => {
      // 'ass' is not found as substring in 'address' (a-d-d-r-e-s-s)
      expect(fuzzyMatch('ass', 'address')).toBe(false);
      // But 'ass' IS found as substring in 'class_assignment'
      expect(fuzzyMatch('ass', 'class_assignment')).toBe(true);
      // These work because of word boundaries
      expect(fuzzyMatch('addr', 'billing_address')).toBe(true);
      expect(fuzzyMatch('trans', 'user_transactions')).toBe(true);
    });
  });
});
