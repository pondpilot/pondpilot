import { describe, expect, it, jest } from '@jest/globals';
import {
  buildCharToLineMap,
  safeSliceBySpan,
  isSpanValid,
  type Utf16Span,
} from '@utils/editor/spans';

describe('UTF-16 span utilities', () => {
  describe('buildCharToLineMap', () => {
    it('should return empty map for empty positions', () => {
      const result = buildCharToLineMap('SELECT * FROM t', []);
      expect(result.size).toBe(0);
    });

    it('should map positions to correct line numbers', () => {
      const text = 'SELECT *\nFROM t\nWHERE x = 1';
      const positions = [0, 9, 16];
      const result = buildCharToLineMap(text, positions);

      expect(result.get(0)).toBe(1); // Start of 'SELECT'
      expect(result.get(9)).toBe(2); // Start of 'FROM'
      expect(result.get(16)).toBe(3); // Start of 'WHERE'
    });

    it('should handle unsorted positions', () => {
      const text = 'SELECT *\nFROM t';
      const positions = [9, 0];
      const result = buildCharToLineMap(text, positions);

      expect(result.get(0)).toBe(1);
      expect(result.get(9)).toBe(2);
    });
  });

  describe('safeSliceBySpan', () => {
    it('should extract substring for valid span', () => {
      const text = 'SELECT * FROM t';
      const span: Utf16Span = { start: 0, end: 6 };
      expect(safeSliceBySpan(text, span)).toBe('SELECT');
    });

    it('should handle span at end of text', () => {
      const text = 'SELECT * FROM t';
      const span: Utf16Span = { start: 14, end: 15 };
      expect(safeSliceBySpan(text, span)).toBe('t');
    });

    it('should handle UTF-16 offsets with emoji', () => {
      // Emoji '😀' is 2 UTF-16 code units (surrogate pair)
      const text = "SELECT '😀' AS emoji";
      const span: Utf16Span = { start: 8, end: 10 }; // Just the emoji
      expect(safeSliceBySpan(text, span)).toBe('😀');
    });

    it('should handle UTF-16 offsets with CJK characters', () => {
      // CJK characters are 1 UTF-16 code unit each
      const text = 'SELECT 你好 AS greeting';
      const span: Utf16Span = { start: 7, end: 9 }; // Just '你好'
      expect(safeSliceBySpan(text, span)).toBe('你好');
    });

    it('should handle multiple emoji', () => {
      // Each emoji is 2 UTF-16 code units
      const text = "SELECT '😀👍' AS emoji";
      const span: Utf16Span = { start: 8, end: 12 }; // Both emoji
      expect(safeSliceBySpan(text, span)).toBe('😀👍');
    });

    it('should return null and warn for negative start', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const text = 'SELECT * FROM t';
      const span: Utf16Span = { start: -1, end: 6 };
      expect(safeSliceBySpan(text, span, 'test')).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid span (test)'));
      consoleSpy.mockRestore();
    });

    it('should return null and warn for end beyond length', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const text = 'SELECT * FROM t';
      const span: Utf16Span = { start: 0, end: 100 };
      expect(safeSliceBySpan(text, span)).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid span'));
      consoleSpy.mockRestore();
    });

    it('should return null and warn for start > end', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const text = 'SELECT * FROM t';
      const span: Utf16Span = { start: 10, end: 5 };
      expect(safeSliceBySpan(text, span)).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle zero-length span at valid position', () => {
      const text = 'SELECT * FROM t';
      const span: Utf16Span = { start: 6, end: 6 };
      expect(safeSliceBySpan(text, span)).toBe('');
    });
  });

  describe('isSpanValid', () => {
    it('should return true for valid span', () => {
      const text = 'SELECT * FROM t';
      expect(isSpanValid(text, { start: 0, end: 6 })).toBe(true);
      expect(isSpanValid(text, { start: 0, end: 15 })).toBe(true);
      expect(isSpanValid(text, { start: 14, end: 15 })).toBe(true);
    });

    it('should return false for negative start', () => {
      const text = 'SELECT * FROM t';
      expect(isSpanValid(text, { start: -1, end: 6 })).toBe(false);
    });

    it('should return false for end beyond length', () => {
      const text = 'SELECT * FROM t';
      expect(isSpanValid(text, { start: 0, end: 16 })).toBe(false);
    });

    it('should return false for start > end', () => {
      const text = 'SELECT * FROM t';
      expect(isSpanValid(text, { start: 10, end: 5 })).toBe(false);
    });

    it('should handle emoji text correctly', () => {
      // '😀' is 2 UTF-16 code units
      const text = '😀';
      expect(isSpanValid(text, { start: 0, end: 2 })).toBe(true);
      expect(isSpanValid(text, { start: 0, end: 1 })).toBe(true); // Partial surrogate is valid offset
      expect(isSpanValid(text, { start: 0, end: 3 })).toBe(false); // Beyond length
    });
  });
});
