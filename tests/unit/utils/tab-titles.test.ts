import { describe, expect, it } from '@jest/globals';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { getSchemaBrowserDisplayTitle, getSchemaBrowserTabTitle } from '@utils/tab-titles';

describe('QuackRidge schema-browser titles', () => {
  it('uses the selected database instead of an unknown database label', () => {
    const connectionId = 'ridge-connection' as PersistentDataSourceId;
    const dataSources = new Map<PersistentDataSourceId, AnyDataSource>([
      [
        connectionId,
        {
          type: 'quackridge',
          id: connectionId,
          endpoint: 'quack:127.0.0.1:9494',
          alias: 'ridge',
          productVersion: '0.2.0',
          protocolVersion: 2,
          capabilities: ['metadata_v2'],
          connectionState: 'connected',
          pairedAt: 1,
          attachedAt: 1,
          secretRef: 'secret-id' as any,
        },
      ],
    ]);
    const tab = {
      sourceType: 'db' as const,
      sourceId: connectionId,
      databaseName: 'commerce',
      schemaName: 'sales',
      objectNames: ['orders'],
    };

    expect(getSchemaBrowserTabTitle(tab, dataSources, new Map())).toBe('QuackRidge: commerce');
    expect(getSchemaBrowserDisplayTitle(tab, dataSources, new Map())).toEqual({
      prefix: 'QuackRidge:',
      title: 'commerce',
    });
  });
});
