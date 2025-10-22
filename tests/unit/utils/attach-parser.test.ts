import { describe, it, expect } from '@jest/globals';
import {
  parseAttachStatement,
  parseDetachStatement,
  ATTACH_STATEMENT_REGEX,
} from '../../../src/utils/attach-parser';

describe('attach-parser', () => {
  describe('parseAttachStatement', () => {
    it('should parse basic ATTACH statement', () => {
      const result = parseAttachStatement("ATTACH 'https://example.com/db.duckdb' AS mydb");
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: "ATTACH 'https://example.com/db.duckdb' AS mydb",
      });
    });

    it('should parse ATTACH with DATABASE keyword', () => {
      const result = parseAttachStatement(
        "ATTACH DATABASE 'https://example.com/db.duckdb' AS mydb",
      );
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: "ATTACH DATABASE 'https://example.com/db.duckdb' AS mydb",
      });
    });

    it('should parse ATTACH with IF NOT EXISTS', () => {
      const result = parseAttachStatement(
        "ATTACH IF NOT EXISTS 'https://example.com/db.duckdb' AS mydb",
      );
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: "ATTACH IF NOT EXISTS 'https://example.com/db.duckdb' AS mydb",
      });
    });

    it('should parse ATTACH with DATABASE IF NOT EXISTS', () => {
      const result = parseAttachStatement(
        "ATTACH DATABASE IF NOT EXISTS 'https://example.com/db.duckdb' AS mydb",
      );
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: "ATTACH DATABASE IF NOT EXISTS 'https://example.com/db.duckdb' AS mydb",
      });
    });

    it('should parse ATTACH with double quotes for URL', () => {
      const result = parseAttachStatement('ATTACH "https://example.com/db.duckdb" AS mydb');
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: 'ATTACH "https://example.com/db.duckdb" AS mydb',
      });
    });

    it('should parse ATTACH with double quotes for database name', () => {
      const result = parseAttachStatement("ATTACH 'https://example.com/db.duckdb' AS \"mydb\"");
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: "ATTACH 'https://example.com/db.duckdb' AS \"mydb\"",
      });
    });

    it('should parse ATTACH with both double quotes', () => {
      const result = parseAttachStatement('ATTACH "https://example.com/db.duckdb" AS "mydb"');
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: 'ATTACH "https://example.com/db.duckdb" AS "mydb"',
      });
    });

    it('should parse S3 URLs', () => {
      const result = parseAttachStatement("ATTACH 's3://bucket/data.duckdb' AS s3db");
      expect(result).toEqual({
        rawUrl: 's3://bucket/data.duckdb',
        dbName: 's3db',
        statement: "ATTACH 's3://bucket/data.duckdb' AS s3db",
      });
    });

    it('should parse URLs with paths and query strings', () => {
      const result = parseAttachStatement(
        "ATTACH 'https://example.com/path/to/db.duckdb?version=1' AS versioned",
      );
      expect(result).toEqual({
        rawUrl: 'https://example.com/path/to/db.duckdb?version=1',
        dbName: 'versioned',
        statement: "ATTACH 'https://example.com/path/to/db.duckdb?version=1' AS versioned",
      });
    });

    it('should handle proxy: prefix in URLs', () => {
      const result = parseAttachStatement("ATTACH 'proxy:https://example.com/db.duckdb' AS mydb");
      expect(result).toEqual({
        rawUrl: 'proxy:https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: "ATTACH 'proxy:https://example.com/db.duckdb' AS mydb",
      });
    });

    it('should be case-insensitive', () => {
      const result = parseAttachStatement("attach 'https://example.com/db.duckdb' as mydb");
      expect(result).not.toBeNull();
      expect(result?.dbName).toBe('mydb');
    });

    it('should return null for invalid statements', () => {
      expect(parseAttachStatement('SELECT * FROM table')).toBeNull();
      expect(parseAttachStatement('CREATE TABLE foo (id INT)')).toBeNull();
      expect(parseAttachStatement('DETACH mydb')).toBeNull();
      expect(parseAttachStatement('')).toBeNull();
    });

    it('should return null for malformed ATTACH statements', () => {
      expect(parseAttachStatement('ATTACH https://example.com/db.duckdb AS mydb')).toBeNull(); // Missing quotes
      expect(parseAttachStatement("ATTACH 'https://example.com/db.duckdb'")).toBeNull(); // Missing AS clause
      expect(parseAttachStatement('ATTACH AS mydb')).toBeNull(); // Missing URL
    });
  });

  describe('parseDetachStatement', () => {
    it('should parse basic DETACH statement', () => {
      const result = parseDetachStatement('DETACH mydb');
      expect(result).toBe('mydb');
    });

    it('should parse DETACH with DATABASE keyword', () => {
      const result = parseDetachStatement('DETACH DATABASE mydb');
      expect(result).toBe('mydb');
    });

    it('should be case-insensitive', () => {
      const result = parseDetachStatement('detach database mydb');
      expect(result).toBe('mydb');
    });

    it('should handle database names with underscores', () => {
      const result = parseDetachStatement('DETACH my_remote_db');
      expect(result).toBe('my_remote_db');
    });

    it('should handle database names with numbers', () => {
      const result = parseDetachStatement('DETACH db123');
      expect(result).toBe('db123');
    });

    it('should return null for invalid statements', () => {
      expect(parseDetachStatement('SELECT * FROM table')).toBeNull();
      expect(parseDetachStatement('ATTACH db AS mydb')).toBeNull();
      expect(parseDetachStatement('')).toBeNull();
    });

    it('should return null for DETACH without database name', () => {
      expect(parseDetachStatement('DETACH')).toBeNull();
      expect(parseDetachStatement('DETACH DATABASE')).toBeNull();
    });
  });

  describe('ATTACH_STATEMENT_REGEX', () => {
    it('should export the regex constant', () => {
      expect(ATTACH_STATEMENT_REGEX).toBeInstanceOf(RegExp);
    });

    it('should match valid ATTACH statements', () => {
      expect(ATTACH_STATEMENT_REGEX.test("ATTACH 'url' AS db")).toBe(true);
      expect(ATTACH_STATEMENT_REGEX.test("ATTACH DATABASE 'url' AS db")).toBe(true);
      expect(ATTACH_STATEMENT_REGEX.test("ATTACH IF NOT EXISTS 'url' AS db")).toBe(true);
    });

    it('should not match invalid statements', () => {
      expect(ATTACH_STATEMENT_REGEX.test('SELECT * FROM table')).toBe(false);
      expect(ATTACH_STATEMENT_REGEX.test('DETACH db')).toBe(false);
    });
  });
});
