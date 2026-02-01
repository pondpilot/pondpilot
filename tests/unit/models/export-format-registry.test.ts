import { describe, it, expect } from '@jest/globals';
import {
  exportFormatRegistry,
  formatOptions,
  getFormatDefinition,
  getFormatExtension,
} from '@models/export-format-registry';
import { ExportFormat } from '@models/export-options';

describe('export-format-registry', () => {
  describe('exportFormatRegistry', () => {
    it('should contain all expected formats', () => {
      const keys = exportFormatRegistry.map((def) => def.key);
      expect(keys).toContain('csv');
      expect(keys).toContain('tsv');
      expect(keys).toContain('xlsx');
      expect(keys).toContain('sql');
      expect(keys).toContain('xml');
      expect(keys).toContain('md');
      expect(keys).toContain('parquet');
    });

    it('should have unique keys', () => {
      const keys = exportFormatRegistry.map((def) => def.key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('should have non-empty labels for all formats', () => {
      for (const def of exportFormatRegistry) {
        expect(def.label).toBeTruthy();
        expect(def.label.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty extensions for all formats', () => {
      for (const def of exportFormatRegistry) {
        expect(def.extension).toBeTruthy();
        expect(def.extension.length).toBeGreaterThan(0);
      }
    });

    it('should have buildDefaultOptions for all formats', () => {
      for (const def of exportFormatRegistry) {
        const options = def.buildDefaultOptions();
        expect(options).toBeDefined();
        expect(typeof options).toBe('object');
      }
    });

    it('should have exportFn for all formats', () => {
      for (const def of exportFormatRegistry) {
        expect(typeof def.exportFn).toBe('function');
      }
    });
  });

  describe('formatOptions', () => {
    it('should be derived from the registry', () => {
      expect(formatOptions.length).toBe(exportFormatRegistry.length);
      for (let i = 0; i < exportFormatRegistry.length; i += 1) {
        expect(formatOptions[i].label).toBe(exportFormatRegistry[i].label);
        expect(formatOptions[i].value).toBe(exportFormatRegistry[i].key);
      }
    });
  });

  describe('getFormatDefinition', () => {
    it('should return the correct definition for a valid key', () => {
      const csvDef = getFormatDefinition('csv');
      expect(csvDef).toBeDefined();
      expect(csvDef!.key).toBe('csv');
      expect(csvDef!.label).toBe('CSV');
      expect(csvDef!.extension).toBe('csv');
    });

    it('should return the parquet definition', () => {
      const parquetDef = getFormatDefinition('parquet');
      expect(parquetDef).toBeDefined();
      expect(parquetDef!.key).toBe('parquet');
      expect(parquetDef!.label).toBe('Parquet');
      expect(parquetDef!.extension).toBe('parquet');
    });

    it('should return undefined for an unknown key', () => {
      const unknown = getFormatDefinition('nonexistent' as ExportFormat);
      expect(unknown).toBeUndefined();
    });
  });

  describe('getFormatExtension', () => {
    it('should return the correct extension for known formats', () => {
      expect(getFormatExtension('csv')).toBe('csv');
      expect(getFormatExtension('tsv')).toBe('tsv');
      expect(getFormatExtension('xlsx')).toBe('xlsx');
      expect(getFormatExtension('sql')).toBe('sql');
      expect(getFormatExtension('xml')).toBe('xml');
      expect(getFormatExtension('md')).toBe('md');
      expect(getFormatExtension('parquet')).toBe('parquet');
    });

    it('should fall back to the key itself for unknown formats', () => {
      expect(getFormatExtension('unknown' as ExportFormat)).toBe('unknown');
    });
  });

  describe('default options', () => {
    it('csv default options should include delimiter', () => {
      const csvDef = getFormatDefinition('csv')!;
      const options = csvDef.buildDefaultOptions() as any;
      expect(options.includeHeader).toBe(true);
      expect(options.delimiter).toBe(',');
    });

    it('tsv default options should include tab delimiter', () => {
      const tsvDef = getFormatDefinition('tsv')!;
      const options = tsvDef.buildDefaultOptions() as any;
      expect(options.delimiter).toBe('\t');
    });

    it('parquet default options should include compression', () => {
      const parquetDef = getFormatDefinition('parquet')!;
      const options = parquetDef.buildDefaultOptions() as any;
      expect(options.compression).toBe('snappy');
    });

    it('xlsx default options should include sheet name', () => {
      const xlsxDef = getFormatDefinition('xlsx')!;
      const options = xlsxDef.buildDefaultOptions() as any;
      expect(options.sheetName).toBe('Sheet1');
    });
  });
});
