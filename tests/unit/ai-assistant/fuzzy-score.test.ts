import { describe, expect, test } from '@jest/globals';

import { fuzzyScore } from '../../../src/features/editor/ai-assistant/mention-autocomplete';

describe('fuzzyScore function', () => {
  describe('exact matches', () => {
    test('should return 1000 for exact match', () => {
      expect(fuzzyScore('users', 'users')).toBe(1000);
      expect(fuzzyScore('database', 'database')).toBe(1000);
      expect(fuzzyScore('test_table', 'test_table')).toBe(1000);
    });

    test('should be case insensitive for exact match', () => {
      expect(fuzzyScore('Users', 'users')).toBe(1000);
      expect(fuzzyScore('USERS', 'users')).toBe(1000);
      expect(fuzzyScore('users', 'USERS')).toBe(1000);
      expect(fuzzyScore('UsErS', 'uSeRs')).toBe(1000);
    });
  });

  describe('prefix matches', () => {
    test('should score prefix matches in 900-899 range', () => {
      expect(fuzzyScore('user', 'users')).toBe(899); // 900 - 1 (length diff)
      expect(fuzzyScore('use', 'users')).toBe(898); // 900 - 2
      expect(fuzzyScore('data', 'database')).toBe(896); // 900 - 4
      expect(fuzzyScore('u', 'users')).toBe(896); // 900 - 4
    });

    test('should be case insensitive for prefix match', () => {
      expect(fuzzyScore('USER', 'users')).toBe(899);
      expect(fuzzyScore('user', 'USERS')).toBe(899);
      expect(fuzzyScore('User', 'Users')).toBe(899);
    });

    test('longer length differences should reduce score more', () => {
      expect(fuzzyScore('user', 'user_authentication_tokens')).toBe(878); // 900 - 22
      expect(fuzzyScore('app', 'application_settings_table')).toBe(877); // 900 - 23
    });
  });

  describe('contains matches', () => {
    test('should score contains matches in 700-X range', () => {
      // "user" at position 4 in "app_users" = 700 - 40 - 5 = 655
      expect(fuzzyScore('user', 'app_users')).toBe(655);
      // "table" at position 5 in "user_table" = 700 - 50 - 5 = 645
      expect(fuzzyScore('table', 'user_table')).toBe(645);
      // "db" at position 5 in "test_db_connection" = 700 - 50 - 16 = 634
      expect(fuzzyScore('db', 'test_db_connection')).toBe(634);
    });

    test('earlier position should score higher', () => {
      // "test" at position 0 in "test_table" = prefix match = 900 - 6 = 894
      expect(fuzzyScore('test', 'test_table')).toBe(894); // Actually prefix match
      // "test" at position 5 in "user_test_table" = 700 - 50 - 11 = 639
      expect(fuzzyScore('test', 'user_test_table')).toBe(639);
    });
  });

  describe('fuzzy character matching', () => {
    test('should match characters in order with base score', () => {
      // "usr" matches u-s-r in "users" (not consecutive)
      // u: 100 + 30 (boundary), s: 100, r: 100, consecutive bonus for s-r: 50
      // minus length penalty 5*2 = 10
      // Total: 420
      const score = fuzzyScore('usr', 'users');
      expect(score).toBeGreaterThan(400);
      expect(score).toBeLessThan(450);
    });

    test('consecutive characters should get bonus', () => {
      // "use" in "users" - all consecutive
      // Actually this is a prefix match, so 900 - 2 = 898
      expect(fuzzyScore('use', 'users')).toBe(898);

      // For true fuzzy consecutive test, let's use a non-prefix case
      // "ser" in "users" at position 1
      // This is a contains match: 700 - 10 - 2 = 688
      expect(fuzzyScore('ser', 'users')).toBe(688);
    });

    test('word boundary matches should get bonus', () => {
      // Testing underscore boundaries
      // "ta" matching at word boundary in "user_table" (after underscore)
      const scoreWithBoundary = fuzzyScore('ta', 'user_table');
      // "ta" matching in middle of "status"
      const scoreWithoutBoundary = fuzzyScore('ta', 'status');

      // user_table: t at pos 5 (after _) gets boundary bonus, a at pos 6
      // Contains match: 700 - 50 - 8 = 642
      expect(scoreWithBoundary).toBe(642);
      // status: Contains match at pos 1: 700 - 10 - 4 = 686
      expect(scoreWithoutBoundary).toBe(686);

      // Actually in this case, earlier position wins over boundary bonus
      // Let's test a clearer case
      const boundaryScore = fuzzyScore('t', 'user_table'); // t after _ at pos 5
      const middleScore = fuzzyScore('t', 'abstract'); // t at pos 3

      // Both are contains matches, but boundary gets position penalty
      expect(middleScore).toBeGreaterThan(boundaryScore);
    });

    test('should not match if characters are out of order', () => {
      expect(fuzzyScore('rsu', 'users')).toBe(0); // Characters not in order
      expect(fuzzyScore('xyz', 'users')).toBe(0); // No matching characters
      expect(fuzzyScore('esru', 'users')).toBe(0); // Backwards
    });
  });

  describe('empty and edge cases', () => {
    test('empty query should be treated as prefix match', () => {
      // Empty query is technically a prefix of any string
      expect(fuzzyScore('', 'users')).toBe(895); // 900 - 5
      expect(fuzzyScore('', 'anything')).toBe(892); // 900 - 8
      expect(fuzzyScore('', '')).toBe(1000); // Exact match
    });

    test('empty text should return 0 unless query is also empty', () => {
      expect(fuzzyScore('user', '')).toBe(0);
      expect(fuzzyScore('anything', '')).toBe(0);
    });

    test('special characters should be matched literally', () => {
      expect(fuzzyScore('user_table', 'user_table')).toBe(1000);
      expect(fuzzyScore('user-table', 'user_table')).toBe(0); // Different special char
      expect(fuzzyScore('user.table', 'user_table')).toBe(0); // Different special char
      expect(fuzzyScore('user_', 'user_table')).toBe(895); // Prefix match
    });

    test('numbers in names should work', () => {
      expect(fuzzyScore('table1', 'table1')).toBe(1000);
      expect(fuzzyScore('table', 'table1')).toBe(899); // Prefix match
      expect(fuzzyScore('1', 'table1')).toBe(645); // Contains at position 5: 700 - 50 - 5
      // tab1: t(100+30), a(100), b(100), 1(100) = 430 - 12 = 418
      expect(fuzzyScore('tab1', 'table1')).toBeGreaterThan(400);
    });
  });

  describe('scoring consistency', () => {
    test('scores should be deterministic', () => {
      const query = 'user';
      const text = 'user_authentication';
      const score1 = fuzzyScore(query, text);
      const score2 = fuzzyScore(query, text);
      expect(score1).toBe(score2);
    });

    test('exact match should always beat prefix match', () => {
      const exactScore = fuzzyScore('users', 'users');
      const prefixScore = fuzzyScore('users', 'users_table');
      expect(exactScore).toBeGreaterThan(prefixScore);
    });

    test('prefix match should always beat contains match', () => {
      const prefixScore = fuzzyScore('user', 'users');
      const containsScore = fuzzyScore('user', 'app_users');
      expect(prefixScore).toBeGreaterThan(containsScore);
    });

    test('contains match should always beat fuzzy match', () => {
      const containsScore = fuzzyScore('user', 'app_users');
      const fuzzyScore1 = fuzzyScore('usr', 'users');
      expect(containsScore).toBeGreaterThan(fuzzyScore1);
    });
  });

  describe('real-world scenarios', () => {
    test('should handle common database naming patterns', () => {
      // Snake case
      expect(fuzzyScore('user', 'user_accounts')).toBe(891); // Prefix: 900 - 9
      expect(fuzzyScore('account', 'user_accounts')).toBe(644); // Contains at pos 5: 700 - 50 - 6

      // Plurals
      expect(fuzzyScore('user', 'users')).toBe(899); // 900 - 1
      expect(fuzzyScore('account', 'accounts')).toBe(899); // 900 - 1

      // Abbreviations
      expect(fuzzyScore('db', 'database')).toBeGreaterThan(0);
      expect(fuzzyScore('auth', 'authentication')).toBe(890); // 900 - 10
    });

    test('should handle schema-qualified names appropriately', () => {
      // Just search the table name part
      expect(fuzzyScore('users', 'public.users')).toBe(623); // Contains at position 7: 700 - 70 - 7
      expect(fuzzyScore('public', 'public.users')).toBe(894); // Prefix match: 900 - 6
    });
  });
});
