import { describe, expect, test } from '@jest/globals';

import { DatabaseModel } from '../../../src/features/editor/ai-assistant/model';
import {
  categorizeMentions,
  expandDatabaseMentions,
} from '../../../src/features/editor/ai-assistant/utils/mention-categorization';
import { DataBaseModel } from '../../../src/models/db';
import { SQLScript, SQLScriptId } from '../../../src/models/sql-script';

// Mock data
const createMockDatabase = (name: string, tables: string[]): DataBaseModel => ({
  name,
  schemas: [
    {
      name: 'public',
      objects: tables.map((tableName) => ({
        name: tableName,
        label: tableName,
        type: 'table' as const,
        columns: [],
      })),
    },
  ],
});

const createMockScript = (id: string, name: string): SQLScript => ({
  id: id as SQLScriptId,
  name,
  content: `-- Script: ${name}`,
});

describe('Mention Categorization', () => {
  describe('categorizeMentions', () => {
    test('should categorize mentions with no context', () => {
      const rawMentions = ['users', 'orders', 'products'];
      const result = categorizeMentions(rawMentions, undefined, undefined);

      expect(result.mentionedTableNames).toEqual(new Set(['users', 'orders', 'products']));
      expect(result.mentionedDbNames).toEqual(new Set());
      expect(result.mentionedScriptIds).toEqual(new Set());
    });

    test('should identify database mentions', () => {
      const databaseModel: DatabaseModel = new Map([
        ['mydb', createMockDatabase('mydb', ['users', 'orders'])],
        ['testdb', createMockDatabase('testdb', ['products'])],
      ]);

      const rawMentions = ['mydb', 'users', 'unknown'];
      const result = categorizeMentions(rawMentions, databaseModel, undefined);

      expect(result.mentionedDbNames).toEqual(new Set(['mydb']));
      expect(result.mentionedTableNames).toEqual(new Set(['users', 'unknown']));
      expect(result.mentionedScriptIds).toEqual(new Set());
    });

    test('should identify script mentions', () => {
      const scripts = new Map<string, SQLScript>([
        ['script1', createMockScript('script1', 'user_report')],
        ['script2', createMockScript('script2', 'order_analysis')],
      ]);

      const rawMentions = ['user_report', 'users', 'unknown'];
      const result = categorizeMentions(rawMentions, undefined, scripts);

      expect(result.mentionedScriptIds).toEqual(new Set(['script1']));
      expect(result.mentionedTableNames).toEqual(new Set(['users', 'unknown']));
      expect(result.mentionedDbNames).toEqual(new Set());
    });

    test('should handle all types of mentions together', () => {
      const databaseModel: DatabaseModel = new Map([
        ['mydb', createMockDatabase('mydb', ['users', 'orders'])],
      ]);
      const scripts = new Map<string, SQLScript>([
        ['script1', createMockScript('script1', 'user_report')],
      ]);

      const rawMentions = ['mydb', 'users', 'user_report', 'unknown'];
      const result = categorizeMentions(rawMentions, databaseModel, scripts);

      expect(result.mentionedDbNames).toEqual(new Set(['mydb']));
      expect(result.mentionedTableNames).toEqual(new Set(['users', 'unknown']));
      expect(result.mentionedScriptIds).toEqual(new Set(['script1']));
    });

    test('should prioritize script over database/table with same name', () => {
      const databaseModel: DatabaseModel = new Map([
        ['report', createMockDatabase('report', ['data'])],
      ]);
      const scripts = new Map<string, SQLScript>([
        ['script1', createMockScript('script1', 'report')],
      ]);

      const rawMentions = ['report'];
      const result = categorizeMentions(rawMentions, databaseModel, scripts);

      // Script takes precedence
      expect(result.mentionedScriptIds).toEqual(new Set(['script1']));
      expect(result.mentionedDbNames).toEqual(new Set());
    });

    test('should prioritize database over table with same name', () => {
      const databaseModel: DatabaseModel = new Map([
        ['users', createMockDatabase('users', ['profiles', 'settings'])],
        ['main', createMockDatabase('main', ['users', 'orders'])],
      ]);

      const rawMentions = ['users'];
      const result = categorizeMentions(rawMentions, databaseModel, undefined);

      // Database takes precedence
      expect(result.mentionedDbNames).toEqual(new Set(['users']));
      expect(result.mentionedTableNames).toEqual(new Set());
    });

    test('should handle empty mentions', () => {
      const result = categorizeMentions([], undefined, undefined);

      expect(result.mentionedTableNames).toEqual(new Set());
      expect(result.mentionedDbNames).toEqual(new Set());
      expect(result.mentionedScriptIds).toEqual(new Set());
    });

    test('should handle duplicate mentions', () => {
      const rawMentions = ['users', 'users', 'users'];
      const result = categorizeMentions(rawMentions, undefined, undefined);

      expect(result.mentionedTableNames).toEqual(new Set(['users']));
    });
  });

  describe('expandDatabaseMentions', () => {
    test('should expand single database to its tables', () => {
      const databaseModel: DatabaseModel = new Map([
        ['mydb', createMockDatabase('mydb', ['users', 'orders', 'products'])],
      ]);

      const mentionedDbNames = new Set(['mydb']);
      const result = expandDatabaseMentions(mentionedDbNames, databaseModel);

      expect(result).toEqual(new Set(['users', 'orders', 'products']));
    });

    test('should expand multiple databases', () => {
      const databaseModel: DatabaseModel = new Map([
        ['db1', createMockDatabase('db1', ['users', 'orders'])],
        ['db2', createMockDatabase('db2', ['products', 'categories'])],
      ]);

      const mentionedDbNames = new Set(['db1', 'db2']);
      const result = expandDatabaseMentions(mentionedDbNames, databaseModel);

      expect(result).toEqual(new Set(['users', 'orders', 'products', 'categories']));
    });

    test('should handle views as well as tables', () => {
      const databaseModel: DatabaseModel = new Map([
        [
          'mydb',
          {
            name: 'mydb',
            schemas: [
              {
                name: 'public',
                objects: [
                  { name: 'users', label: 'users', type: 'table' as const, columns: [] },
                  { name: 'user_stats', label: 'user_stats', type: 'view' as const, columns: [] },
                ],
              },
            ],
          },
        ],
      ]);

      const mentionedDbNames = new Set(['mydb']);
      const result = expandDatabaseMentions(mentionedDbNames, databaseModel);

      expect(result).toEqual(new Set(['users', 'user_stats']));
    });

    test('should handle non-existent database gracefully', () => {
      const databaseModel: DatabaseModel = new Map([
        ['mydb', createMockDatabase('mydb', ['users'])],
      ]);

      const mentionedDbNames = new Set(['nonexistent', 'mydb']);
      const result = expandDatabaseMentions(mentionedDbNames, databaseModel);

      // Should only expand the existing database
      expect(result).toEqual(new Set(['users']));
    });

    test('should handle empty input', () => {
      const databaseModel: DatabaseModel = new Map([
        ['mydb', createMockDatabase('mydb', ['users'])],
      ]);

      const result = expandDatabaseMentions(new Set(), databaseModel);

      expect(result).toEqual(new Set());
    });

    test('should handle undefined database model', () => {
      const mentionedDbNames = new Set(['mydb']);
      const result = expandDatabaseMentions(mentionedDbNames, undefined);

      expect(result).toEqual(new Set());
    });

    test('should handle multiple schemas', () => {
      const databaseModel: DatabaseModel = new Map([
        [
          'mydb',
          {
            name: 'mydb',
            schemas: [
              {
                name: 'public',
                objects: [{ name: 'users', label: 'users', type: 'table' as const, columns: [] }],
              },
              {
                name: 'private',
                objects: [
                  { name: 'secrets', label: 'secrets', type: 'table' as const, columns: [] },
                ],
              },
            ],
          },
        ],
      ]);

      const mentionedDbNames = new Set(['mydb']);
      const result = expandDatabaseMentions(mentionedDbNames, databaseModel);

      expect(result).toEqual(new Set(['users', 'secrets']));
    });
  });
});
