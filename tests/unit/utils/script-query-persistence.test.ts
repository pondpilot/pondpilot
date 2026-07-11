import { describe, expect, it } from '@jest/globals';

import { DataBaseModel } from '../../../src/models/db';
import {
  isSystemDatabaseEmpty,
  shouldResetRestoredScriptQuery,
} from '../../../src/utils/script-query-persistence';

const buildMetadata = (systemObjects: string[]): Map<string, DataBaseModel> =>
  new Map([
    [
      'pondpilot',
      {
        name: 'pondpilot',
        schemas: [
          {
            name: 'main',
            objects: systemObjects.map((name) => ({
              name,
              label: name,
              type: 'table' as const,
              columns: [],
            })),
          },
        ],
      },
    ],
  ]);

describe('script-query-persistence', () => {
  it('treats a missing or object-less system database as empty', () => {
    expect(isSystemDatabaseEmpty(new Map())).toBe(true);
    expect(isSystemDatabaseEmpty(buildMetadata([]))).toBe(true);
  });

  it('does not reset restored queries when the system database has objects', () => {
    const metadata = buildMetadata(['store_purchases']);

    expect(
      shouldResetRestoredScriptQuery(
        'SELECT * FROM pondpilot.main.store_purchases',
        isSystemDatabaseEmpty(metadata),
      ),
    ).toBe(false);
  });

  it('resets restored queries that depend on pondpilot.main when the system database is empty', () => {
    const metadata = buildMetadata([]);

    expect(
      shouldResetRestoredScriptQuery(
        'SELECT account_id FROM pondpilot.main.store_purchases',
        isSystemDatabaseEmpty(metadata),
      ),
    ).toBe(true);
  });

  it('does not reset unrelated restored queries when the system database is empty', () => {
    const metadata = buildMetadata([]);

    expect(shouldResetRestoredScriptQuery('SELECT 1', isSystemDatabaseEmpty(metadata))).toBe(false);
    expect(
      shouldResetRestoredScriptQuery(
        'SELECT * FROM motherduck.main.store_purchases',
        isSystemDatabaseEmpty(metadata),
      ),
    ).toBe(false);
  });
});
