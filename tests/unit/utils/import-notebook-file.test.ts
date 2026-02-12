/* eslint-disable import/order -- Module-under-test import must come after jest.mock calls for proper mock hoisting */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockCreateNotebookFromImport = jest.fn();
const mockGetOrCreateTabFromNotebook = jest.fn();
const mockParseSqlnb = jest.fn();

jest.mock('@components/app-notifications', () => ({
  showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
  showError: (...args: unknown[]) => mockShowError(...args),
}));

jest.mock('@controllers/notebook/notebook-controller', () => ({
  createNotebookFromImport: (...args: unknown[]) => mockCreateNotebookFromImport(...args),
}));

jest.mock('@controllers/tab/notebook-tab-controller', () => ({
  getOrCreateTabFromNotebook: (...args: unknown[]) => mockGetOrCreateTabFromNotebook(...args),
}));

jest.mock('@utils/notebook-export', () => ({
  parseSqlnb: (...args: unknown[]) => mockParseSqlnb(...args),
}));

jest.mock('@utils/file-system-adapter', () => ({
  fileSystemService: {
    pickFiles: jest.fn(),
  },
}));

// eslint-disable-next-line import/first -- Module-under-test import must come after jest.mock calls
import { importNotebookFromFile, isNotebookFileName } from '@utils/import-notebook-file';

type TestFile = Pick<File, 'name' | 'text'>;

const makeFile = (name: string, content = '{}'): File => ({
  name,
  text: async () => content,
} as TestFile as File);

describe('import-notebook-file', () => {
  beforeEach(() => {
    mockShowSuccess.mockReset();
    mockShowError.mockReset();
    mockCreateNotebookFromImport.mockReset();
    mockGetOrCreateTabFromNotebook.mockReset();
    mockParseSqlnb.mockReset();

    mockParseSqlnb.mockReturnValue({
      name: 'Imported Notebook',
      cells: [{ type: 'sql', content: 'SELECT 1' }],
    });
    mockCreateNotebookFromImport.mockReturnValue({
      id: 'nb-1',
      name: 'Imported Notebook',
    });
  });

  describe('isNotebookFileName', () => {
    it('accepts lower, upper, and mixed-case .sqlnb extensions', () => {
      expect(isNotebookFileName('report.sqlnb')).toBe(true);
      expect(isNotebookFileName('REPORT.SQLNB')).toBe(true);
      expect(isNotebookFileName('Report.SqlNb')).toBe(true);
    });

    it('rejects non-notebook extensions', () => {
      expect(isNotebookFileName('report.sql')).toBe(false);
      expect(isNotebookFileName('report.sqlnb.bak')).toBe(false);
    });
  });

  describe('importNotebookFromFile', () => {
    it('imports uppercase extension notebooks', async () => {
      const result = await importNotebookFromFile(makeFile('Report.SQLNB', '{"version":1}'));

      expect(result).toBe(true);
      expect(mockParseSqlnb).toHaveBeenCalledTimes(1);
      expect(mockCreateNotebookFromImport).toHaveBeenCalledTimes(1);
      expect(mockGetOrCreateTabFromNotebook).toHaveBeenCalledWith('nb-1', true);
      expect(mockShowSuccess).toHaveBeenCalledTimes(1);
    });

    it('skips non-notebook files before parsing', async () => {
      const result = await importNotebookFromFile(makeFile('Report.sql'));

      expect(result).toBe(false);
      expect(mockParseSqlnb).not.toHaveBeenCalled();
      expect(mockCreateNotebookFromImport).not.toHaveBeenCalled();
      expect(mockGetOrCreateTabFromNotebook).not.toHaveBeenCalled();
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(mockShowError).not.toHaveBeenCalled();
    });
  });
});
