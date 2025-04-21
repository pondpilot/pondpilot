import { describe, expect, it } from '@jest/globals';
import { escapeCSVField } from '@utils/helpers';

describe('escape CSV values', () => {
  it('should not modify string without commas, quotes or newlines', () => {
    expect(escapeCSVField('text with 🚀')).toBe('text with 🚀');
  });
  it('should escape commas, quotes or newlines', () => {
    expect(escapeCSVField('"')).toBe('""""');
    expect(escapeCSVField(',')).toBe('","');
    expect(escapeCSVField('\n')).toBe('"\n"');
    expect(escapeCSVField('simple "text"')).toBe('"simple ""text"""');
    expect(escapeCSVField('text, with, commas')).toBe('"text, with, commas"');
    expect(escapeCSVField('text with "commas", and quotes')).toBe(
      '"text with ""commas"", and quotes"',
    );
    expect(escapeCSVField('all in: comma, dobule"",\nafter newline')).toBe(
      '"all in: comma, dobule"""",\nafter newline"',
    );
  });
});
