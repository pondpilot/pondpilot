import {
  parseUserCellName,
  normalizeCellName,
  validateCellName,
  extractCellReferences,
} from '@features/notebook/utils/cell-naming';
import { describe, expect, it } from '@jest/globals';

describe('parseUserCellName', () => {
  it('parses name with colon syntax', () => {
    expect(parseUserCellName('-- @name: revenue_by_month\nSELECT * FROM sales')).toBe(
      'revenue_by_month',
    );
  });

  it('parses name with space syntax', () => {
    expect(parseUserCellName('-- @name my_view\nSELECT 1')).toBe('my_view');
  });

  it('returns null for no annotation', () => {
    expect(parseUserCellName('SELECT * FROM sales')).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(parseUserCellName('')).toBeNull();
  });

  it('returns null for annotation not on first line', () => {
    expect(parseUserCellName('SELECT 1;\n-- @name: my_view')).toBeNull();
  });

  it('rejects invalid identifiers', () => {
    expect(parseUserCellName('-- @name: 123invalid')).toBeNull();
  });

  it('handles leading/trailing whitespace in annotation', () => {
    expect(parseUserCellName('-- @name:   spaced_name  \nSELECT 1')).toBe('spaced_name');
  });

  it('handles underscore-prefixed names', () => {
    expect(parseUserCellName('-- @name: _private\nSELECT 1')).toBe('_private');
  });
});

describe('normalizeCellName', () => {
  it('normalizes blank names to null', () => {
    expect(normalizeCellName('  my_view  ')).toBe('my_view');
    expect(normalizeCellName('   ')).toBeNull();
    expect(normalizeCellName(undefined)).toBeNull();
  });
});

describe('validateCellName', () => {
  it('accepts valid identifiers', () => {
    expect(validateCellName('my_view')).toBeNull();
    expect(validateCellName('_private')).toBeNull();
    expect(validateCellName('CamelCase123')).toBeNull();
  });

  it('rejects names starting with digits', () => {
    expect(validateCellName('123abc')).not.toBeNull();
  });

  it('rejects names with special characters', () => {
    expect(validateCellName('my-view')).not.toBeNull();
    expect(validateCellName('my view')).not.toBeNull();
  });

  it('rejects reserved prefix __pp_cell_', () => {
    expect(validateCellName('__pp_cell_1')).not.toBeNull();
    expect(validateCellName('__pp_cell_custom')).not.toBeNull();
  });

  it('rejects reserved prefix case-insensitively', () => {
    expect(validateCellName('__PP_CELL_custom')).not.toBeNull();
    expect(validateCellName('__Pp_CeLl_1')).not.toBeNull();
  });
});

describe('extractCellReferences', () => {
  it('extracts stable ref names that exist in availableNames', () => {
    const sql = 'SELECT * FROM __pp_cell_1 JOIN __pp_cell_3 ON __pp_cell_1.id = __pp_cell_3.id';
    const available = new Set(['__pp_cell_1', '__pp_cell_3']);
    const refs = extractCellReferences(sql, available);
    expect(refs).toEqual(['__pp_cell_1', '__pp_cell_3']);
  });

  it('includes explicit notebook refs even when unavailable', () => {
    const sql = 'SELECT * FROM __pp_cell_1 JOIN __pp_cell_99';
    const available = new Set(['__pp_cell_1']);
    const refs = extractCellReferences(sql, available);
    expect(refs).toEqual(['__pp_cell_1', '__pp_cell_99']);
  });

  it('extracts user-defined name references', () => {
    const sql = 'SELECT * FROM revenue_data WHERE x > 0';
    const available = new Set(['revenue_data', 'other_view']);
    const refs = extractCellReferences(sql, available);
    expect(refs).toEqual(['revenue_data']);
  });

  it('extracts both stable refs and user-defined references', () => {
    const sql = 'SELECT * FROM __pp_cell_1 JOIN my_view ON __pp_cell_1.id = my_view.id';
    const available = new Set(['__pp_cell_1', 'my_view']);
    const refs = extractCellReferences(sql, available);
    expect(refs).toEqual(['__pp_cell_1', 'my_view']);
  });

  it('deduplicates references', () => {
    const sql = 'SELECT * FROM __pp_cell_1 UNION SELECT * FROM __pp_cell_1';
    const available = new Set(['__pp_cell_1']);
    const refs = extractCellReferences(sql, available);
    expect(refs).toEqual(['__pp_cell_1']);
  });

  it('returns empty for SQL without references', () => {
    const sql = 'SELECT 1 as x';
    const refs = extractCellReferences(sql, new Set());
    expect(refs).toEqual([]);
  });

  it('does not match partial names', () => {
    const sql = 'SELECT my_view_extended FROM t';
    const available = new Set(['my_view']);
    const refs = extractCellReferences(sql, available);
    expect(refs).toEqual([]);
  });
});
