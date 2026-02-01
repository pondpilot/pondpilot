import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { DataAdapterApi } from '@models/data-adapter';

// Set up minimal DOM globals needed by downloadFile()
const mockLink = {
  href: '',
  download: '',
  style: { visibility: '' },
  click: jest.fn(),
};

beforeAll(() => {
  (global as any).document = {
    createElement: jest.fn((tag: string) => {
      if (tag === 'a') return mockLink;
      return {};
    }),
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
  };
  (global as any).URL = {
    createObjectURL: jest.fn(() => 'blob:test'),
    revokeObjectURL: jest.fn(),
  };
  (global as any).Blob = class MockBlob {
    parts: any[];
    options: any;
    constructor(parts: any[], options?: any) {
      this.parts = parts;
      this.options = options;
    }
  };
});

afterAll(() => {
  delete (global as any).document;
  delete (global as any).URL;
  delete (global as any).Blob;
});

// Dynamic import after globals are set up
let isValidXmlElementName: typeof import('@utils/export-data').isValidXmlElementName;
let createExportFileName: typeof import('@utils/export-data').createExportFileName;
let exportAsParquet: typeof import('@utils/export-data').exportAsParquet;
let sanitizeFileName: typeof import('@utils/export-data').sanitizeFileName;

beforeAll(async () => {
  const mod = await import('@utils/export-data');
  isValidXmlElementName = mod.isValidXmlElementName;
  createExportFileName = mod.createExportFileName;
  exportAsParquet = mod.exportAsParquet;
  sanitizeFileName = mod.sanitizeFileName;
});

describe('export-data utils', () => {
  describe('createExportFileName', () => {
    it('should use format extension from registry', () => {
      expect(createExportFileName('myfile', 'csv')).toBe('myfile.csv');
      expect(createExportFileName('myfile', 'parquet')).toBe(
        'myfile.parquet',
      );
      expect(createExportFileName('myfile', 'xlsx')).toBe('myfile.xlsx');
      expect(createExportFileName('myfile', 'md')).toBe('myfile.md');
    });

    it('should sanitize filename', () => {
      expect(createExportFileName('my<file>', 'csv')).toBe('my_file_.csv');
    });
  });

  describe('sanitizeFileName', () => {
    it('should remove illegal characters', () => {
      expect(sanitizeFileName('file<>:"|?*name')).toBe('file_______name');
    });

    it('should replace forward slash with underscore', () => {
      expect(sanitizeFileName('path/file')).toBe('path_file');
    });
  });

  describe('exportAsParquet', () => {
    it('should throw if sourceQuery is null', async () => {
      const adapter = {
        sourceQuery: null,
        pool: {},
      } as unknown as DataAdapterApi;

      await expect(
        exportAsParquet(
          adapter,
          { includeHeader: true, compression: 'snappy' },
          'test.parquet',
        ),
      ).rejects.toThrow('source query');
    });

    it('should throw if pool is null', async () => {
      const adapter = {
        sourceQuery: 'SELECT * FROM test',
        pool: null,
      } as unknown as DataAdapterApi;

      await expect(
        exportAsParquet(
          adapter,
          { includeHeader: true, compression: 'snappy' },
          'test.parquet',
        ),
      ).rejects.toThrow('connection pool');
    });

    it('should call pool.query with correct COPY TO statement', async () => {
      const mockQuery = jest.fn<() => Promise<any>>().mockResolvedValue({});
      const mockCopyFileToBuffer = jest
        .fn<() => Promise<Uint8Array>>()
        .mockResolvedValue(new Uint8Array([1, 2, 3]));
      const mockDropFile = jest
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);

      const adapter = {
        sourceQuery: 'SELECT * FROM main."my_table"',
        pool: {
          query: mockQuery,
          copyFileToBuffer: mockCopyFileToBuffer,
          dropFile: mockDropFile,
        },
      } as unknown as DataAdapterApi;

      // Reset mock link state
      mockLink.href = '';
      mockLink.download = '';
      mockLink.click.mockClear();

      await exportAsParquet(
        adapter,
        { includeHeader: true, compression: 'gzip' },
        'output.parquet',
      );

      // Verify COPY TO query was called with correct compression
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [firstCall] = mockQuery.mock.calls;
      const queryArg = String(firstCall);
      expect(queryArg).toContain('COPY');
      expect(queryArg).toContain('SELECT * FROM main."my_table"');
      expect(queryArg).toContain('FORMAT PARQUET');
      expect(queryArg).toContain("COMPRESSION 'gzip'");

      // Verify file was read and cleaned up
      expect(mockCopyFileToBuffer).toHaveBeenCalledTimes(1);
      expect(mockDropFile).toHaveBeenCalledTimes(1);

      // Verify download was triggered
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toBe('output.parquet');
    });
  });

  describe('isValidXmlElementName', () => {
    it('should validate correct XML element names', () => {
      expect(isValidXmlElementName('validName')).toBe(true);
      expect(isValidXmlElementName('_validName')).toBe(true);
      expect(isValidXmlElementName('valid-name')).toBe(true);
      expect(isValidXmlElementName('valid.name')).toBe(true);
      expect(isValidXmlElementName('valid_name123')).toBe(true);
    });

    it('should reject invalid XML element names', () => {
      expect(isValidXmlElementName('')).toBe(false);
      expect(isValidXmlElementName('123invalid')).toBe(false);
      expect(isValidXmlElementName('-invalid')).toBe(false);
      expect(isValidXmlElementName('invalid name')).toBe(false);
      expect(isValidXmlElementName('invalid@name')).toBe(false);
    });

    it('should reject names starting with xml', () => {
      expect(isValidXmlElementName('xml')).toBe(false);
      expect(isValidXmlElementName('XML')).toBe(false);
      expect(isValidXmlElementName('xmlElement')).toBe(false);
      expect(isValidXmlElementName('XMLElement')).toBe(false);
      expect(isValidXmlElementName('XmL_name')).toBe(false);
    });
  });
});
