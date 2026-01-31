import { describe, it, expect } from '@jest/globals';

import {
  parseAttachStatement,
  parseDetachStatement,
  parseIcebergAttachStatement,
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
      const result = parseAttachStatement('ATTACH \'https://example.com/db.duckdb\' AS "mydb"');
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: 'ATTACH \'https://example.com/db.duckdb\' AS "mydb"',
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

    it('should ignore trailing semicolons after the database name', () => {
      const result = parseAttachStatement("ATTACH 'https://example.com/db.duckdb' AS mydb;");
      expect(result).toEqual({
        rawUrl: 'https://example.com/db.duckdb',
        dbName: 'mydb',
        statement: "ATTACH 'https://example.com/db.duckdb' AS mydb;",
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

  describe('parseIcebergAttachStatement', () => {
    it('should parse basic Iceberg ATTACH with ENDPOINT and SECRET', () => {
      const sql =
        "ATTACH 'my_warehouse' AS my_catalog (TYPE ICEBERG, ENDPOINT 'https://rest.example.com', SECRET my_secret)";
      const result = parseIcebergAttachStatement(sql);
      expect(result).toEqual({
        warehouseName: 'my_warehouse',
        catalogAlias: 'my_catalog',
        endpoint: 'https://rest.example.com',
        endpointType: undefined,
        secretName: 'my_secret',
        statement: sql,
      });
    });

    it('should parse Iceberg ATTACH with ENDPOINT_TYPE GLUE', () => {
      const sql =
        "ATTACH 'warehouse' AS glue_cat (TYPE ICEBERG, ENDPOINT_TYPE GLUE, SECRET aws_creds)";
      const result = parseIcebergAttachStatement(sql);
      expect(result).not.toBeNull();
      expect(result?.endpointType).toBe('GLUE');
      expect(result?.endpoint).toBeUndefined();
    });

    it('should parse Iceberg ATTACH with ENDPOINT_TYPE S3_TABLES', () => {
      const sql =
        "ATTACH 'warehouse' AS s3t_cat (TYPE ICEBERG, ENDPOINT_TYPE S3_TABLES, SECRET aws_creds)";
      const result = parseIcebergAttachStatement(sql);
      expect(result).not.toBeNull();
      expect(result?.endpointType).toBe('S3_TABLES');
    });

    it('should parse quoted ENDPOINT_TYPE s3_tables', () => {
      const sql =
        "ATTACH IF NOT EXISTS 'arn:aws:s3tables:us-east-1:123:bucket/wh' AS my_cat (TYPE iceberg, SECRET my_secret, ENDPOINT_TYPE 's3_tables')";
      const result = parseIcebergAttachStatement(sql);
      expect(result).not.toBeNull();
      expect(result?.endpointType).toBe('s3_tables');
      expect(result?.secretName).toBe('my_secret');
    });

    it('should parse quoted ENDPOINT_TYPE GLUE', () => {
      const sql =
        "ATTACH 'wh' AS glue_cat (TYPE ICEBERG, SECRET aws_creds, ENDPOINT_TYPE 'GLUE')";
      const result = parseIcebergAttachStatement(sql);
      expect(result).not.toBeNull();
      expect(result?.endpointType).toBe('GLUE');
    });

    it('should be case-insensitive for TYPE ICEBERG', () => {
      const lower =
        "attach 'wh' as cat (type iceberg, endpoint 'https://example.com', secret s)";
      const mixed =
        "Attach 'wh' AS cat (Type Iceberg, Endpoint 'https://example.com', Secret s)";

      expect(parseIcebergAttachStatement(lower)).not.toBeNull();
      expect(parseIcebergAttachStatement(mixed)).not.toBeNull();
    });

    it('should handle DATABASE and IF NOT EXISTS keywords', () => {
      const sql =
        "ATTACH DATABASE IF NOT EXISTS 'wh' AS cat (TYPE ICEBERG, SECRET s)";
      const result = parseIcebergAttachStatement(sql);
      expect(result).not.toBeNull();
      expect(result?.warehouseName).toBe('wh');
      expect(result?.catalogAlias).toBe('cat');
    });

    it('should return null for non-Iceberg ATTACH with TYPE SQLITE', () => {
      const sql = "ATTACH 'test.db' AS mydb (TYPE SQLITE)";
      expect(parseIcebergAttachStatement(sql)).toBeNull();
    });

    it('should return null for ATTACH without TYPE option', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb";
      expect(parseIcebergAttachStatement(sql)).toBeNull();
    });

    it('should handle missing SECRET option', () => {
      const sql =
        "ATTACH 'wh' AS cat (TYPE ICEBERG, ENDPOINT 'https://rest.example.com')";
      const result = parseIcebergAttachStatement(sql);
      expect(result).not.toBeNull();
      expect(result?.secretName).toBeUndefined();
    });

    it('should return null for malformed options block', () => {
      // No closing parenthesis — regex won't match
      const sql = "ATTACH 'wh' AS cat (TYPE ICEBERG";
      expect(parseIcebergAttachStatement(sql)).toBeNull();
    });

    it('should return null for non-ATTACH statements', () => {
      expect(parseIcebergAttachStatement('SELECT 1')).toBeNull();
      expect(parseIcebergAttachStatement('')).toBeNull();
      expect(parseIcebergAttachStatement('DETACH mydb')).toBeNull();
    });

    it('should handle double-quoted alias', () => {
      const sql =
        "ATTACH 'wh' AS \"my_catalog\" (TYPE ICEBERG, SECRET s)";
      const result = parseIcebergAttachStatement(sql);
      expect(result).not.toBeNull();
      expect(result?.catalogAlias).toBe('my_catalog');
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
