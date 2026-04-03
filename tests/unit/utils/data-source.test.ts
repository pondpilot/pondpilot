import { describe, expect, it } from '@jest/globals';
import {
  formatMotherDuckDbKey,
  isMotherDuckDbKey,
  parseMotherDuckDbKey,
  MD_DB_PREFIX,
} from '@utils/data-source';

describe('MotherDuck metadata key helpers', () => {
  describe('MD_DB_PREFIX', () => {
    it('should be "md:"', () => {
      expect(MD_DB_PREFIX).toBe('md:');
    });
  });

  describe('formatMotherDuckDbKey', () => {
    it('should prefix a database name with "md:"', () => {
      expect(formatMotherDuckDbKey('my_db')).toBe('md:my_db');
    });

    it('should handle empty string', () => {
      expect(formatMotherDuckDbKey('')).toBe('md:');
    });

    it('should handle names with special characters', () => {
      expect(formatMotherDuckDbKey('db-with-dashes')).toBe('md:db-with-dashes');
      expect(formatMotherDuckDbKey('db.with.dots')).toBe('md:db.with.dots');
    });
  });

  describe('isMotherDuckDbKey', () => {
    it('should return true for valid per-database keys', () => {
      expect(isMotherDuckDbKey('md:my_db')).toBe(true);
      expect(isMotherDuckDbKey('md:another_db')).toBe(true);
    });

    it('should return false for the bare root key "md:"', () => {
      expect(isMotherDuckDbKey('md:')).toBe(false);
    });

    it('should return false for non-MD keys', () => {
      expect(isMotherDuckDbKey('pondpilot')).toBe(false);
      expect(isMotherDuckDbKey('local_db')).toBe(false);
      expect(isMotherDuckDbKey('')).toBe(false);
    });

    it('should return false for keys that only partially match the prefix', () => {
      expect(isMotherDuckDbKey('m')).toBe(false);
      expect(isMotherDuckDbKey('md')).toBe(false);
    });
  });

  describe('parseMotherDuckDbKey', () => {
    it('should return the plain database name for valid MD keys', () => {
      expect(parseMotherDuckDbKey('md:my_db')).toBe('my_db');
      expect(parseMotherDuckDbKey('md:another_db')).toBe('another_db');
    });

    it('should return null for the bare root key', () => {
      expect(parseMotherDuckDbKey('md:')).toBeNull();
    });

    it('should return null for non-MD keys', () => {
      expect(parseMotherDuckDbKey('pondpilot')).toBeNull();
      expect(parseMotherDuckDbKey('')).toBeNull();
    });

    it('should handle database names with colons', () => {
      expect(parseMotherDuckDbKey('md:db:with:colons')).toBe('db:with:colons');
    });
  });

  describe('roundtrip: format → parse', () => {
    it('should roundtrip correctly', () => {
      const names = ['my_db', 'test-db', 'db_with_underscore'];
      for (const name of names) {
        const key = formatMotherDuckDbKey(name);
        expect(isMotherDuckDbKey(key)).toBe(true);
        expect(parseMotherDuckDbKey(key)).toBe(name);
      }
    });
  });
});
