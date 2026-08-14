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

  it('falls back to the connection label before a database is selected', () => {
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
      schemaName: undefined,
      objectNames: undefined,
      databaseName: undefined,
    };

    expect(getSchemaBrowserTabTitle(tab, dataSources, new Map())).toBe('QuackRidge');
    expect(getSchemaBrowserDisplayTitle(tab, dataSources, new Map())).toEqual({
      prefix: 'QuackRidge:',
      title: 'ridge',
    });
  });

  it('formats all-sources and folder titles, including missing folders', () => {
    const allTab = {
      sourceType: 'all' as const,
      sourceId: null,
      schemaName: undefined,
      objectNames: undefined,
      databaseName: undefined,
    };
    expect(getSchemaBrowserTabTitle(allTab, new Map(), new Map())).toBe('All Data Sources');
    expect(getSchemaBrowserDisplayTitle(allTab, new Map(), new Map())).toEqual({
      title: 'All Data Sources',
    });
    const explicitAllTab = { ...allTab, sourceId: 'all-sources' as any };
    expect(getSchemaBrowserTabTitle(explicitAllTab, new Map(), new Map())).toBe('All Data Sources');
    expect(getSchemaBrowserDisplayTitle(explicitAllTab, new Map(), new Map())).toEqual({
      title: 'All Data Sources',
    });

    const folderId = 'folder-id' as any;
    const folderTab = { ...allTab, sourceType: 'folder' as const, sourceId: folderId };
    const folders = new Map([
      [folderId, { kind: 'directory', id: folderId, uniqueAlias: 'imports' } as any],
    ]);
    expect(getSchemaBrowserTabTitle(folderTab, new Map(), folders)).toBe('Folder: imports');
    expect(getSchemaBrowserDisplayTitle(folderTab, new Map(), folders)).toEqual({
      prefix: 'Folder:',
      title: 'imports',
    });
    expect(getSchemaBrowserTabTitle(folderTab, new Map(), new Map())).toBe('Folder');
    expect(getSchemaBrowserDisplayTitle(folderTab, new Map(), new Map())).toEqual({
      prefix: 'Folder:',
      title: 'Unknown',
    });
  });
});
