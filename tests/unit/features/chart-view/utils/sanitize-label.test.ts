import { sanitizeChartLabel } from '@features/chart-view/utils/sanitize-label';
import { describe, it, expect } from '@jest/globals';

describe('sanitizeChartLabel', () => {
  describe('null and empty handling', () => {
    it('should return null for null input', () => {
      expect(sanitizeChartLabel(null)).toBe(null);
    });

    it('should return null for empty string', () => {
      expect(sanitizeChartLabel('')).toBe(null);
    });

    it('should return null for whitespace-only string', () => {
      expect(sanitizeChartLabel('   ')).toBe(null);
      expect(sanitizeChartLabel('\t\n')).toBe(null);
    });
  });

  describe('whitespace trimming', () => {
    it('should trim leading and trailing whitespace', () => {
      expect(sanitizeChartLabel('  hello  ')).toBe('hello');
      expect(sanitizeChartLabel('\thello\n')).toBe('hello');
    });

    it('should preserve internal whitespace', () => {
      expect(sanitizeChartLabel('hello world')).toBe('hello world');
      expect(sanitizeChartLabel('hello  world')).toBe('hello  world');
    });
  });

  describe('control character removal', () => {
    it('should remove null bytes', () => {
      expect(sanitizeChartLabel('hello\x00world')).toBe('helloworld');
    });

    it('should remove other control characters', () => {
      expect(sanitizeChartLabel('hello\x01\x02\x03world')).toBe('helloworld');
      expect(sanitizeChartLabel('test\x7F')).toBe('test');
    });

    it('should preserve newlines and tabs within content', () => {
      // Newlines (\x0A) and tabs (\x09) are useful for multi-line labels
      expect(sanitizeChartLabel('line1\nline2')).toBe('line1\nline2');
      expect(sanitizeChartLabel('col1\tcol2')).toBe('col1\tcol2');
    });
  });

  describe('length truncation', () => {
    it('should not truncate strings under 100 characters', () => {
      const shortString = 'a'.repeat(99);
      expect(sanitizeChartLabel(shortString)).toBe(shortString);
    });

    it('should not truncate strings exactly 100 characters', () => {
      const exactString = 'a'.repeat(100);
      expect(sanitizeChartLabel(exactString)).toBe(exactString);
    });

    it('should truncate strings over 100 characters with ellipsis', () => {
      const longString = 'a'.repeat(150);
      const result = sanitizeChartLabel(longString);
      expect(result).toBe(`${'a'.repeat(97)}...`);
      expect(result?.length).toBe(100);
    });
  });

  describe('realistic scenarios', () => {
    it('should handle normal chart titles', () => {
      expect(sanitizeChartLabel('Sales by Region')).toBe('Sales by Region');
      expect(sanitizeChartLabel('Q4 2024 Revenue')).toBe('Q4 2024 Revenue');
    });

    it('should handle axis labels', () => {
      expect(sanitizeChartLabel('Revenue ($)')).toBe('Revenue ($)');
      expect(sanitizeChartLabel('Date')).toBe('Date');
    });

    it('should handle special characters', () => {
      expect(sanitizeChartLabel('Price (€)')).toBe('Price (€)');
      expect(sanitizeChartLabel('Growth %')).toBe('Growth %');
      expect(sanitizeChartLabel('日本語')).toBe('日本語');
    });
  });
});
