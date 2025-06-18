import { describe, expect, test } from '@jest/globals';

import {
  extractMentions,
  extractMentionedTables,
  detectMentionTrigger,
} from '../../../src/features/editor/ai-assistant/mention-autocomplete';

describe('Mention Extraction', () => {
  describe('extractMentions', () => {
    test('should extract single mention', () => {
      const text = 'SELECT * FROM @users';
      const result = extractMentions(text);

      expect(result.tables).toEqual(['users']);
      expect(result.databases).toEqual([]);
      expect(result.scripts).toEqual([]);
    });

    test('should extract multiple mentions', () => {
      const text = 'SELECT * FROM @users JOIN @orders ON @users.id = @orders.user_id';
      const result = extractMentions(text);

      expect(result.tables).toContain('users');
      expect(result.tables).toContain('orders');
      expect(result.tables).toHaveLength(2);
    });

    test('should handle mentions with underscores', () => {
      const text = 'SELECT * FROM @user_profiles';
      const result = extractMentions(text);

      expect(result.tables).toEqual(['user_profiles']);
    });

    test('should handle mentions with numbers', () => {
      const text = 'SELECT * FROM @table2023';
      const result = extractMentions(text);

      expect(result.tables).toEqual(['table2023']);
    });

    test('should ignore incomplete mentions', () => {
      const text = 'SELECT * FROM @ WHERE id = 1';
      const result = extractMentions(text);

      expect(result.tables).toEqual([]);
    });

    test('should ignore mentions with special characters', () => {
      const text = 'SELECT * FROM @user-table'; // Hyphen not allowed
      const result = extractMentions(text);

      expect(result.tables).toEqual(['user']); // Only captures valid part
    });

    test('should handle mentions at different positions', () => {
      const text = '@start middle @middle and @end';
      const result = extractMentions(text);

      expect(result.tables).toContain('start');
      expect(result.tables).toContain('middle');
      expect(result.tables).toContain('end');
      expect(result.tables).toHaveLength(3);
    });

    test('should deduplicate mentions', () => {
      const text = 'SELECT * FROM @users, @users, @users';
      const result = extractMentions(text);

      expect(result.tables).toEqual(['users']);
    });

    test('should handle empty text', () => {
      const result = extractMentions('');

      expect(result.tables).toEqual([]);
      expect(result.databases).toEqual([]);
      expect(result.scripts).toEqual([]);
    });

    test('should handle text with no mentions', () => {
      const text = 'SELECT * FROM users WHERE id = 1';
      const result = extractMentions(text);

      expect(result.tables).toEqual([]);
    });
  });

  describe('extractMentionedTables (legacy)', () => {
    test('should extract tables using legacy function', () => {
      const text = 'SELECT * FROM @users JOIN @orders';
      const result = extractMentionedTables(text);

      expect(result).toContain('users');
      expect(result).toContain('orders');
      expect(result).toHaveLength(2);
    });
  });

  describe('detectMentionTrigger', () => {
    test('should detect @ at cursor position', () => {
      const text = 'SELECT * FROM @';
      const cursorPos = 15;
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(true);
      expect(result.startPos).toBe(14);
      expect(result.query).toBe('');
    });

    test('should detect @ with partial query', () => {
      const text = 'SELECT * FROM @use';
      const cursorPos = 18;
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(true);
      expect(result.startPos).toBe(14);
      expect(result.query).toBe('use');
    });

    test('should not trigger if @ is not preceded by whitespace', () => {
      const text = 'email@domain.com';
      const cursorPos = 6; // After @
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(false);
    });

    test('should trigger at start of text', () => {
      const text = '@users';
      const cursorPos = 1;
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(true);
      expect(result.startPos).toBe(0);
      expect(result.query).toBe(''); // At position 1, we have @ at 0, so substring(1,1) is empty
    });

    test('should not trigger if cursor is before @', () => {
      const text = 'SELECT * FROM @users';
      const cursorPos = 13; // Before @
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(false);
    });

    test('should handle query with underscores', () => {
      const text = 'SELECT * FROM @user_prof';
      const cursorPos = 24;
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(true);
      expect(result.query).toBe('user_prof');
    });

    test('should stop at whitespace', () => {
      const text = 'SELECT * FROM @users WHERE';
      const cursorPos = 21; // In WHERE
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(false);
    });

    test('should handle cursor at end of mention', () => {
      const text = 'SELECT * FROM @users';
      const cursorPos = 20;
      const result = detectMentionTrigger(text, cursorPos);

      expect(result.isTriggered).toBe(true);
      expect(result.query).toBe('users');
    });

    test('should not trigger for invalid characters', () => {
      const text = 'SELECT * FROM @user-name';
      const cursorPos = 20; // After hyphen
      const result = detectMentionTrigger(text, cursorPos);

      // At position 20, we're after the hyphen
      // The query would be 'user-' which contains invalid character
      expect(result.isTriggered).toBe(false);
    });

    test('should handle empty text', () => {
      const result = detectMentionTrigger('', 0);

      expect(result.isTriggered).toBe(false);
    });
  });
});
