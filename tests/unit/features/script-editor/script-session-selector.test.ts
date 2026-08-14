import { getScriptSessionCatalogs } from '@features/script-editor/script-session-catalogs';
import { describe, expect, it } from '@jest/globals';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { formatQuackRidgeDbKey } from '@utils/data-source';

describe('getScriptSessionCatalogs', () => {
  it('lists QuackRidge proxy catalogs without exposing the bridge control alias', () => {
    const connectionId = 'ridge-connection' as PersistentDataSourceId;
    const dataSources = new Map<PersistentDataSourceId, AnyDataSource>([
      [
        connectionId,
        {
          type: 'quackridge',
          id: connectionId,
          endpoint: 'quack:127.0.0.1:9494',
          alias: 'ridge-control',
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
    const metadata = new Map<string, DataBaseModel>([
      [
        formatQuackRidgeDbKey('ridge-control', 'commerce'),
        { name: 'commerce', sourceHealth: 'ready', schemas: [] },
      ],
      [
        formatQuackRidgeDbKey('ridge-control', 'support'),
        { name: 'support', sourceHealth: 'ready', schemas: [] },
      ],
    ]);

    const catalogs = getScriptSessionCatalogs(dataSources, metadata);

    expect(catalogs).toEqual(expect.arrayContaining(['commerce', 'support']));
    expect(catalogs).not.toContain('ridge-control');
  });

  it('omits QuackRidge sources whose proxy catalogs were not attached', () => {
    const metadata = new Map<string, DataBaseModel>([
      [
        formatQuackRidgeDbKey('ridge-control', 'healthy'),
        { name: 'healthy', sourceHealth: 'ready', schemas: [] },
      ],
      [
        formatQuackRidgeDbKey('ridge-control', 'offline'),
        { name: 'offline', sourceHealth: 'unavailable', schemas: [] },
      ],
    ]);

    const catalogs = getScriptSessionCatalogs(new Map(), metadata);

    expect(catalogs).toContain('healthy');
    expect(catalogs).not.toContain('offline');
  });
});
