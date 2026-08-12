import { describe, expect, it } from '@jest/globals';
import { PersistentDataSourceId, QuackRidgeConnection } from '@models/data-source';
import { LocalDBDataTab, TabId } from '@models/tab';
import { getTabIcon, getTabName } from '@utils/navigation';

describe('QuackRidge tab navigation', () => {
  const connection: QuackRidgeConnection = {
    id: 'ridge-id' as PersistentDataSourceId,
    type: 'quackridge',
    endpoint: 'quack:127.0.0.1:34175',
    alias: 'quackridge',
    productVersion: '0.1.0',
    protocolVersion: 1,
    capabilities: [
      'cancellation_noop',
      'metadata_v1',
      'pairing_v1',
      'query_ids',
      'sticky_sessions',
    ],
    connectionState: 'connected',
    pairedAt: 1,
    attachedAt: 1,
    secretRef: 'secret-id' as any,
  };
  const tab: LocalDBDataTab = {
    id: 'tab-id' as TabId,
    type: 'data-source',
    dataSourceType: 'db',
    dataSourceId: connection.id,
    databaseName: 'support',
    schemaName: 'helpdesk',
    objectName: 'agent',
    objectType: 'table',
    dataViewStateCache: null,
  };

  it('uses the remote database, schema, and table in the tab title', () => {
    expect(
      getTabName(tab, new Map(), new Map([[connection.id, connection]]), new Map(), new Map()),
    ).toBe('support.helpdesk.agent');
  });

  it('uses the database table icon', () => {
    expect(getTabIcon(tab, new Map([[connection.id, connection]]))).toBe('db-table');
  });
});
