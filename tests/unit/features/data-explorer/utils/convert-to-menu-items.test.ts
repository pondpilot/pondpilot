import { buildConvertToMenuItems } from '@features/data-explorer/utils/convert-to-menu-items';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { exportFormatRegistry } from '@models/export-format-registry';
import { TabId } from '@models/tab';
import { setPendingConvert } from '@store/app-store';

jest.mock('@store/app-store', () => ({
  setPendingConvert: jest.fn(),
}));

describe('buildConvertToMenuItems', () => {
  const mockTabId = 'tab-123' as TabId;
  const getOrCreateTab = jest.fn(() => mockTabId);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a "Convert To" menu item with submenu', () => {
    const items = buildConvertToMenuItems(getOrCreateTab, null);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Convert To');
    expect(items[0].submenu).toBeDefined();
  });

  it('should include all formats when sourceFormat is null', () => {
    const items = buildConvertToMenuItems(getOrCreateTab, null);
    const submenu = items[0].submenu!;
    expect(submenu.length).toBe(exportFormatRegistry.length);
  });

  it('should filter out CSV when sourceFormat is csv', () => {
    const items = buildConvertToMenuItems(getOrCreateTab, 'csv');
    const submenu = items[0].submenu!;
    const labels = submenu.map((item) => item.label);
    expect(labels).not.toContain('CSV');
    expect(labels).toContain('TSV');
    expect(labels).toContain('Parquet');
    expect(submenu.length).toBe(exportFormatRegistry.length - 1);
  });

  it('should filter out Parquet when sourceFormat is parquet', () => {
    const items = buildConvertToMenuItems(getOrCreateTab, 'parquet');
    const submenu = items[0].submenu!;
    const labels = submenu.map((item) => item.label);
    expect(labels).not.toContain('Parquet');
    expect(labels).toContain('CSV');
  });

  it('should filter out Excel when sourceFormat is xlsx', () => {
    const items = buildConvertToMenuItems(getOrCreateTab, 'xlsx');
    const submenu = items[0].submenu!;
    const labels = submenu.map((item) => item.label);
    expect(labels).not.toContain('Excel');
    expect(labels).toContain('CSV');
  });

  it('should call getOrCreateTab and setPendingConvert on click', () => {
    const items = buildConvertToMenuItems(getOrCreateTab, null);
    const submenu = items[0].submenu!;
    // Find CSV item
    const csvItem = submenu.find((item) => item.label === 'CSV')!;
    // Simulate click (pass dummy node and tree args)
    csvItem.onClick({} as any, {} as any);

    expect(getOrCreateTab).toHaveBeenCalled();
    expect(setPendingConvert).toHaveBeenCalledWith(mockTabId, 'csv');
  });

  it('should show all formats for database objects (null source)', () => {
    const items = buildConvertToMenuItems(getOrCreateTab, null);
    const submenu = items[0].submenu!;
    const registryKeys = exportFormatRegistry.map((d) => d.key);
    const menuLabels = submenu.map((item) => item.label);

    for (const def of exportFormatRegistry) {
      expect(menuLabels).toContain(def.label);
    }
    expect(menuLabels.length).toBe(registryKeys.length);
  });
});
