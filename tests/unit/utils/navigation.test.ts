import type {
  AnyFlatFileDataSource,
  PersistentDataSourceId,
  XlsxSheetView,
} from '@models/data-source';
import type { LocalEntry, LocalEntryId, LocalFile } from '@models/file-system';
import { getFlatFileDataSourceName } from '@utils/navigation';

const createLocalFile = (overrides: Partial<LocalFile> = {}): LocalFile => ({
  kind: 'file',
  id: 'file-1' as LocalEntryId,
  name: 'orders',
  parentId: null,
  userAdded: true,
  handle: {} as FileSystemFileHandle,
  uniqueAlias: 'orders',
  fileType: 'data-source',
  ext: 'parquet',
  ...overrides,
});

const createFlatFileDataSource = (
  overrides: Partial<AnyFlatFileDataSource> = {},
): AnyFlatFileDataSource => ({
  type: 'parquet',
  id: 'ds-1' as PersistentDataSourceId,
  fileSourceId: 'file-1' as LocalEntryId,
  viewName: 'orders_view',
  ...overrides,
});

describe('getFlatFileDataSourceName', () => {
  it('returns aliased name when entry exists', () => {
    const localEntries = new Map<LocalEntryId, LocalEntry>([
      ['file-1' as LocalEntryId, createLocalFile({ name: 'orders_source' })],
    ]);
    const dataSource = createFlatFileDataSource();

    expect(getFlatFileDataSourceName(dataSource, localEntries)).toBe(
      'orders_view (orders_source)',
    );
  });

  it('falls back to view name when entry is missing', () => {
    const localEntries = new Map<LocalEntryId, LocalEntry>();
    const dataSource = createFlatFileDataSource();

    expect(getFlatFileDataSourceName(dataSource, localEntries)).toBe('orders_view');
  });

  it('includes sheet name when xlsx entry is missing', () => {
    const localEntries = new Map<LocalEntryId, LocalEntry>();
    const dataSource: XlsxSheetView = {
      type: 'xlsx-sheet',
      id: 'sheet-1' as PersistentDataSourceId,
      fileSourceId: 'missing-entry' as LocalEntryId,
      viewName: 'orders_sheet',
      sheetName: 'Sheet1',
    };

    expect(getFlatFileDataSourceName(dataSource, localEntries)).toBe(
      'orders_sheet (Sheet1)',
    );
  });
});
