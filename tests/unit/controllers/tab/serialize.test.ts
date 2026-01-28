import { toSerializableRows } from '@controllers/tab/serialize';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { DataRow } from '@models/db';

// Helper to cast test data as DataRow[] since we're testing serialization behavior
// on arbitrary object shapes (including DuckDB proxy objects)
const asRows = (data: unknown[]): DataRow[] => data as DataRow[];

describe('toSerializableRows', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('handling empty/null/undefined input', () => {
    it('should return empty array for undefined', () => {
      expect(toSerializableRows(undefined)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(toSerializableRows(null)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(toSerializableRows([])).toEqual([]);
    });
  });

  describe('handling plain objects', () => {
    it('should serialize simple plain objects', () => {
      const input = asRows([{ id: 1, name: 'test' }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ id: 1, name: 'test' }]);
      expect(result).not.toBe(input); // Should be a new array
    });

    it('should deep clone nested objects', () => {
      const input = asRows([{ id: 1, nested: { value: 'deep' } }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ id: 1, nested: { value: 'deep' } }]);
      // Verify deep clone by checking nested object is different reference
      const inputNested = (input[0] as Record<string, unknown>).nested;
      const resultNested = (result[0] as Record<string, unknown>).nested;
      expect(resultNested).not.toBe(inputNested);
    });

    it('should handle arrays within objects', () => {
      const input = asRows([{ id: 1, items: [1, 2, 3] }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ id: 1, items: [1, 2, 3] }]);
    });
  });

  describe('handling BigInt values', () => {
    it('should convert BigInt to string', () => {
      const input = asRows([{ id: 1n, value: 'test' }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ id: '1', value: 'test' }]);
    });

    it('should convert large BigInt values to string', () => {
      const largeNumber = 9007199254740993n; // Larger than Number.MAX_SAFE_INTEGER
      const input = asRows([{ id: largeNumber }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ id: '9007199254740993' }]);
    });

    it('should convert nested BigInt values', () => {
      const input = asRows([{ nested: { bigValue: 123n } }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ nested: { bigValue: '123' } }]);
    });
  });

  describe('handling Date values', () => {
    it('should convert Date objects to ISO strings', () => {
      const date = new Date('2024-01-15T12:00:00.000Z');
      const input = asRows([{ createdAt: date }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ createdAt: '2024-01-15T12:00:00.000Z' }]);
    });
  });

  describe('handling special values', () => {
    it('should preserve null values', () => {
      const input = asRows([{ id: 1, value: null }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ id: 1, value: null }]);
    });

    it('should convert undefined values in arrays to null', () => {
      const input = asRows([{ items: [1, undefined, 3] }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ items: [1, null, 3] }]);
    });

    it('should handle boolean values', () => {
      const input = asRows([{ active: true, deleted: false }]);
      const result = toSerializableRows(input);

      expect(result).toEqual([{ active: true, deleted: false }]);
    });
  });

  describe('handling proxy objects (simulating DuckDB Row)', () => {
    it('should convert proxy objects to plain objects', () => {
      const target = { id: 1, name: 'test' };
      const proxy = new Proxy(target, {});
      const input = asRows([proxy]);

      const result = toSerializableRows(input);

      expect(result).toEqual([{ id: 1, name: 'test' }]);
      expect(result[0].constructor).toBe(Object);
    });

    it('should handle nested proxy objects', () => {
      const innerProxy = new Proxy({ value: 'inner' }, {});
      const outerProxy = new Proxy({ nested: innerProxy }, {});
      const input = asRows([outerProxy]);

      const result = toSerializableRows(input);

      expect(result).toEqual([{ nested: { value: 'inner' } }]);
    });
  });

  describe('error handling', () => {
    it('should return empty array and log error for circular references', () => {
      const obj: Record<string, unknown> = { id: 1 };
      obj.self = obj; // Create circular reference
      const input = asRows([obj]);

      const result = toSerializableRows(input);

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Serialize] Failed to serialize rows for IndexedDB:',
        expect.any(Error),
      );
    });
  });

  describe('multiple rows', () => {
    it('should serialize multiple rows correctly', () => {
      const input = asRows([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
        { id: 3, name: 'third' },
      ]);

      const result = toSerializableRows(input);

      expect(result).toEqual(input);
      expect(result.length).toBe(3);
    });

    it('should handle mixed types across rows', () => {
      const input = asRows([
        { id: 1n, value: 'string' },
        { id: 2, value: 123 },
        { id: 3n, value: null },
      ]);

      const result = toSerializableRows(input);

      expect(result).toEqual([
        { id: '1', value: 'string' },
        { id: 2, value: 123 },
        { id: '3', value: null },
      ]);
    });
  });
});
