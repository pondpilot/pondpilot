import { Comparison, ComparisonConfig, ComparisonId, ComparisonSource } from '@models/comparison';

import { makeIdFactory } from './new-id';

export const makeComparisonId = makeIdFactory<ComparisonId>();

export const COMPARISON_RESULTS_TABLE_PREFIX = 'ppc_';

export const isComparisonResultsTableName = (tableName: string): boolean =>
  tableName.startsWith(COMPARISON_RESULTS_TABLE_PREFIX);

export function ensureComparison(
  comparisonOrId: Comparison | ComparisonId,
  comparisons: Map<ComparisonId, Comparison>,
): Comparison {
  // Get the comparison object if not passed as an object
  if (typeof comparisonOrId === 'string') {
    const fromState = comparisons.get(comparisonOrId);

    if (!fromState) {
      throw new Error(`Comparison with id ${comparisonOrId} not found`);
    }

    return fromState;
  }

  return comparisonOrId;
}

/**
 * Generates a deterministic short hash based on comparison sources.
 * Uses a simple Fowler–Noll–Vo (FNV-1a) hash and returns a base36 string.
 */
function createSourceHash(config: ComparisonConfig): string {
  const serializeSource = (source: ComparisonSource | null): string => {
    if (!source) return 'null';
    if (source.type === 'table') {
      const db = source.databaseName ?? '';
      const schema = source.schemaName ?? '';
      return `table:${db}.${schema}.${source.tableName}`;
    }

    return `query:${source.alias}:${source.sql}`;
  };

  const fingerprint = `${serializeSource(config.sourceA)}|${serializeSource(config.sourceB)}`;

  let hash = 0x811c9dc5;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash ^= fingerprint.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }

  return hash.toString(36).slice(0, 8);
}

/**
 * Formats a timestamp as YYYYMMDD_HHmmssSSS.
 */
function formatTimestamp(date: Date): string {
  const pad = (value: number, length: number = 2) => value.toString().padStart(length, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);

  return `${year}${month}${day}_${hours}${minutes}${seconds}${milliseconds}`;
}

/**
 * Generates a table name for storing comparison results in the system database.
 *
 * Format: ppc_{shortHash}_{timestamp}
 *
 * @param comparisonId - The comparison ID (unused but kept for future compatibility)
 * @param config - Current comparison configuration
 * @param createdAt - Timestamp when the table is created
 * @returns A valid SQL table name
 */
export function getComparisonResultsTableName(
  _comparisonId: ComparisonId,
  config: ComparisonConfig,
  createdAt: Date,
): string {
  const shortHash = createSourceHash(config);
  const timestamp = formatTimestamp(createdAt);

  // Ensure we only use safe identifier characters
  const sanitizedHash = shortHash.replace(/[^a-z0-9]/gi, '').toLowerCase();

  return `${COMPARISON_RESULTS_TABLE_PREFIX}${sanitizedHash}_${timestamp}`;
}
