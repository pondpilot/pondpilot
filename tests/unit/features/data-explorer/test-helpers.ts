import { FileTypeFilter } from '@features/data-explorer/components';

/**
 * Get a complete FileTypeFilter object with default values
 * @param overrides - Partial values to override defaults
 */
export function getTestFileTypeFilter(overrides: Partial<FileTypeFilter> = {}): FileTypeFilter {
  return {
    csv: true,
    json: true,
    parquet: true,
    xlsx: true,
    sas7bdat: true,
    xpt: true,
    sav: true,
    zsav: true,
    por: true,
    dta: true,
    ...overrides,
  };
}
