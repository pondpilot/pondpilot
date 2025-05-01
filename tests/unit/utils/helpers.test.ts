import { describe, expect, it } from '@jest/globals';
import { escapeField } from '@utils/helpers';

describe('escape CSV values', () => {
  it('should not modify string without commas, quotes or newlines', () => {
    expect(escapeField('text with 🚀')).toBe('text with 🚀');
  });
  it('should escape commas, quotes or newlines', () => {
    expect(escapeField('"')).toBe('""""');
    expect(escapeField(',')).toBe('","');
    expect(escapeField('\n')).toBe('"\n"');
    expect(escapeField('simple "text"')).toBe('"simple ""text"""');
    expect(escapeField('text, with, commas')).toBe('"text, with, commas"');
    expect(escapeField('text with "commas", and quotes')).toBe(
      '"text with ""commas"", and quotes"',
    );
    expect(escapeField('all in: comma, dobule"",\nafter newline')).toBe(
      '"all in: comma, dobule"""",\nafter newline"',
    );
  });
});
