import { describe, expect, it } from '@jest/globals';
import { escapeCSVField } from '@utils/helpers';

describe('escape CSV values', () => {
  it('should not modify string without commas', () => {
    expect(escapeCSVField('simple text')).toBe('simple text');
    expect(escapeCSVField('simple "text"')).toBe('simple "text"');
  });
  it('should escape commas', () => {
    expect(escapeCSVField('text, with, commas')).toBe('"text, with, commas"');
    expect(escapeCSVField('text with "commas", and quotes')).toBe(
      '"text with ""commas"", and quotes"',
    );
    expect(escapeCSVField('double quotes, ""')).toBe('"double quotes, """""');
  });
});
