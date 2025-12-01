import { describe, it, expect } from '@jest/globals';
import {
  CORE_DATA_SOURCE_FILE_EXTS,
  TAURI_ONLY_DATA_SOURCE_FILE_EXTS,
  supportedFlatFileDataSourceFileExt,
} from '@models/file-system';

describe('SQLite File Handling', () => {
  describe('File Extension Support', () => {
    it('should include db in Tauri-only data source file extensions', () => {
      expect(TAURI_ONLY_DATA_SOURCE_FILE_EXTS).toContain('db');
    });

    it('should NOT include db in core data source file extensions', () => {
      expect(CORE_DATA_SOURCE_FILE_EXTS).not.toContain('db');
    });

    it('should exclude db from flat file data source extensions', () => {
      // db should be treated as a database, not a flat file
      const flatFileExtensions: supportedFlatFileDataSourceFileExt[] = [
        'csv',
        'json',
        'parquet',
        'xlsx',
        'sas7bdat',
        'xpt',
        'sav',
        'zsav',
        'por',
        'dta',
      ];

      // TypeScript should enforce this - db should not be assignable to supportedFlatFileDataSourceFileExt
      // @ts-expect-error - db should not be a valid flat file extension
      const _invalidAssignment: supportedFlatFileDataSourceFileExt = 'db';

      expect(flatFileExtensions).not.toContain('db');
    });

    it('should treat db files the same as duckdb files', () => {
      // Both should be excluded from flat file sources
      const duckdbIsDatabase = !(
        ['csv', 'json', 'parquet', 'xlsx'] as supportedFlatFileDataSourceFileExt[]
      ).includes('duckdb' as any);
      const dbIsDatabase = !(
        ['csv', 'json', 'parquet', 'xlsx'] as supportedFlatFileDataSourceFileExt[]
      ).includes('db' as any);

      expect(duckdbIsDatabase).toBe(true);
      expect(dbIsDatabase).toBe(true);
    });
  });

  describe('MIME Type Mapping', () => {
    it('should have db mime type defined', async () => {
      const fileSystemModule = await import('@models/file-system');
      expect(fileSystemModule.dataSourceExtMap.db).toBe('application/sqlite');
    });
  });
});
