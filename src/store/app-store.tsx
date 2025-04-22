import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { AnyTab, TabId, TabReactiveState, TabType } from '@models/tab';
import { IDBPDatabase } from 'idb';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { ContentViewState } from '@models/content-view';
import {
  AnyDataSource,
  AnyFlatFileDataSource,
  AttachedDB,
  PersistentDataSourceId,
} from '@models/data-source';
import { LocalEntry, LocalEntryId, LocalFile } from '@models/file-system';

import { getTabIcon, getTabName } from '@utils/navigation';
import { IconType } from '@components/named-icon';

import { DataBaseModel, DBTableOrViewSchema } from '@models/db';
import { AppIdbSchema } from '@models/persisted-store';
import { createSelectors } from './utils';
import { resetAppData } from './restore';

type AppLoadState = 'init' | 'ready' | 'error';

type AppStore = {
  /**
   * Connection to the IndexedDB database. May be null if we had an error
   * while opening the database.
   *
   * This is a private property and should not be accessed directly.
   *
   * Used to persist the app state when connection is available.
   */
  _iDbConn: IDBPDatabase<AppIdbSchema> | null;

  /**
   * The current state of the app, indicating whether it is loading, ready, or has encountered an error.
   */
  appLoadState: AppLoadState;

  /**
   * A mapping of persistent data source ids to their corresponding objects.
   */
  dataSources: Map<PersistentDataSourceId, AnyDataSource>;

  /**
   * A mapping of local entry identifiers to their corresponding LocalEntry objects.
   */
  localEntries: Map<LocalEntryId, LocalEntry>;

  /**
   * A mapping of data source local file identifiers to their registered File objects.
   */
  registeredFiles: Map<LocalEntryId, File>;

  /**
   * A mapping of SQL script identifiers to their corresponding SQLScript objects.
   */
  sqlScripts: Map<SQLScriptId, SQLScript>;

  /**
   * A mapping of tab identifiers to their corresponding Tab objects.
   */
  tabs: Map<TabId, AnyTab>;

  /**
   * A mapping of attached database names (including memory) to their corresponding
   * DataBaseModel objects with metadata.
   *
   * This is not persisted in the IndexedDB and instead recreated on app load and
   * then kept in sync with the database.
   */
  dataBaseMetadata: Map<string, DataBaseModel>;
} & ContentViewState;

const initialState: AppStore = {
  _iDbConn: null,
  appLoadState: 'init',
  dataSources: new Map(),
  localEntries: new Map(),
  registeredFiles: new Map(),
  sqlScripts: new Map(),
  tabs: new Map(),
  dataBaseMetadata: new Map(),
  // From ContentViewState
  activeTabId: null,
  previewTabId: null,
  tabOrder: [],
};

export const useAppStore =
  // Wrapper that creates simple getters, so you can just call
  // `useInitStore.use.someStateAttr()` instead of `useInitStore((state) => state.someStateAttr)`
  createSelectors(
    create<AppStore>()(
      // Adds redux devtools support - use in Chrome!
      devtools(() => initialState, { name: 'AppStore' }),
    ),
  );

// Common selectors
export function useSqlScriptIdForActiveTab(): SQLScriptId | null {
  return useAppStore((state) => {
    if (!state.activeTabId) return null;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return null;
    if (tab.type !== 'script') {
      console.warn(`Attempted to get SQLScriptId for non-script tab: ${tab.id}`);
      return null;
    }

    return tab.sqlScriptId;
  });
}

export function useIsSqlScriptIdOnActiveTab(id: SQLScriptId | null): boolean {
  return useAppStore((state) => {
    if (!id) return false;
    if (!state.activeTabId) return false;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return false;
    if (tab.type !== 'script') {
      return false;
    }

    return tab.sqlScriptId === id;
  });
}

export function useIsAttachedDBElementOnActiveTab(
  id: PersistentDataSourceId | null | undefined,
  schemaName: string | null | undefined,
  objectName: string | null | undefined,
  columnName: string | null | undefined,
): boolean {
  return useAppStore((state) => {
    // If we do not have db source id, schema & object OR we have a column
    // means this can't be displayed in the tab. Only tables/views aka objects
    // can be displayed in the tab.
    if (!id || !schemaName || !objectName || columnName) return false;
    if (!state.activeTabId) return false;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return false;
    if (tab.type !== 'data-source' || tab.dataSourceType !== 'db') {
      return false;
    }

    return (
      tab.dataSourceId === id && tab.schemaName === schemaName && tab.objectName === objectName
    );
  });
}

/**
 * Returns the schema of the object in the database from
 * state metadata. This is only available for attached
 * databases and file data sources.
 */
export function useDataSourceObjectSchema(
  dataSource: AnyDataSource,
  schemaName?: string,
  objectName?: string,
): DBTableOrViewSchema {
  return useAppStore(
    useShallow((state) => {
      let dbName: string;

      if (
        dataSource.type === 'csv' ||
        dataSource.type === 'parquet' ||
        dataSource.type === 'xlsx-sheet' ||
        dataSource.type === 'json'
      ) {
        dbName = 'memory';
        schemaName = 'main';
        objectName = dataSource.viewName;
      } else {
        dbName = dataSource.dbName;

        if (!schemaName || !objectName) {
          // Attached DB without schema and object name
          console.error(
            'Schema name and object name were missing when trying to read schema of attached db object',
          );
          return [];
        }
      }
      return (
        state.dataBaseMetadata
          .get(dbName)
          ?.schemas?.find((schema) => schema.name === schemaName)
          ?.objects?.find((object) => object.name === objectName)?.columns || []
      );
    }),
  );
}

export function useDataSourceIdForActiveTab(): PersistentDataSourceId | null {
  return useAppStore((state) => {
    if (!state.activeTabId) return null;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return null;
    if (tab.type !== 'data-source' || tab.dataSourceType !== 'file') {
      return null;
    }

    return tab.dataSourceId;
  });
}

// Memoized selectors

// We use separate memoized selectors for each necessary field, to avoid
// using complex comparator functions...

export function useProtectedViews(): Set<string> {
  return useAppStore(
    useShallow(
      (state) =>
        new Set(
          state.dataSources
            .values()
            .filter((dataSource) => dataSource.type !== 'attached-db')
            .map((dataSource): string => dataSource.viewName),
        ),
    ),
  );
}

export function useFlatFileDataSourceEMap(): Map<PersistentDataSourceId, AnyFlatFileDataSource> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          state.dataSources
            .entries()
            // Unfortunately, typescript doesn't infer from filter here, hence explicit cast
            .filter(([, dataSource]) => dataSource.type !== 'attached-db') as IteratorObject<
            [PersistentDataSourceId, AnyFlatFileDataSource]
          >,
        ),
    ),
  );
}

export function useFlatFileDataSourceMap(): Map<PersistentDataSourceId, AnyFlatFileDataSource> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          state.dataSources
            .entries()
            // Unfortunately, typescript doesn't infer from filter here, hence explicit cast
            .filter(([, dataSource]) => dataSource.type !== 'attached-db') as IteratorObject<
            [PersistentDataSourceId, AnyFlatFileDataSource]
          >,
        ),
    ),
  );
}

export function useAttachedDBDataSourceMap(): Map<PersistentDataSourceId, AttachedDB> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          state.dataSources
            .entries()
            // Unfortunately, typescript doesn't infer from filter here, hence explicit cast
            .filter(([, dataSource]) => dataSource.type === 'attached-db') as IteratorObject<
            [PersistentDataSourceId, AttachedDB]
          >,
        ),
    ),
  );
}

export function useAttachedDBMetadata(): Map<string, DataBaseModel> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(state.dataBaseMetadata.entries().filter(([dbName, _]) => dbName !== 'memory')),
    ),
  );
}

export function useAttachedDBLocalEntriesMap(): Map<LocalEntryId, LocalFile> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          state.dataSources
            .values()
            // Unfortunately, typescript doesn't infer from filter here, hence explicit cast
            .filter((dataSource) => dataSource.type === 'attached-db')
            .map((attachedDB) => state.localEntries.get(attachedDB.fileSourceId))
            // This filter should be unnecessary as this should always be true,
            // unless our state is inconsistent state. But for safety we check it.
            .filter((entry): entry is LocalFile => !!entry && entry.kind === 'file')
            .map((entry) => [entry.id, entry]),
        ),
    ),
  );
}

export function useSqlScripts(): Map<SQLScriptId, SQLScript> {
  return useAppStore(useShallow((state) => state.sqlScripts));
}

export function useTabReactiveState<T extends AnyTab>(
  tabId: TabId,
  tabType: T['type'],
): TabReactiveState<T> {
  return useAppStore(
    useShallow((state) => {
      const tab = state.tabs.get(tabId);

      if (!tab) {
        throw new Error(`Tried opening a tab with unknown id: ${tabId}. Please report this bug.`);
      }

      if (tab.type !== tabType) {
        throw new Error(
          `Tab type mismatch. Expected \`${tabType}\`, got: \`${tab.type}\`. Please report this bug.`,
        );
      }

      const { dataViewStateCache: _, ...rest } = tab;

      return rest as TabReactiveState<T>;
    }),
  );
}

export function useTabIconMap(): Map<TabId, IconType> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          Array.from(state.tabs).map(([id, tab]): [TabId, IconType] => [
            id,
            getTabIcon(tab, state.dataSources),
          ]),
        ),
    ),
  );
}

export function useTabNameMap(): Map<TabId, string> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          Array.from(state.tabs).map(([id, tab]): [TabId, string] => [
            id,
            getTabName(tab, state.sqlScripts, state.dataSources, state.localEntries),
          ]),
        ),
    ),
  );
}

export function useTabTypeMap(): Map<TabId, TabType> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(Array.from(state.tabs).map(([id, tab]): [TabId, TabType] => [id, tab.type])),
    ),
  );
}

// Simple actions / setters that are not "big" enough to go to controllers
export const setAppLoadState = (appState: AppLoadState) => {
  useAppStore.setState({ appLoadState: appState }, undefined, 'AppStore/setAppLoadState');
};

export const setIDbConn = (iDbConn: IDBPDatabase<AppIdbSchema>) => {
  useAppStore.setState({ _iDbConn: iDbConn }, undefined, 'AppStore/setIDbConn');
};

export const resetAppState = async () => {
  const { _iDbConn: iDbConn, appLoadState } = useAppStore.getState();

  // Drop all table data first
  if (iDbConn) {
    await resetAppData(iDbConn);
  }

  // Reset the store to its initial state except for the iDbConn and appLoadState
  useAppStore.setState(
    { ...initialState, _iDbConn: iDbConn, appLoadState },
    undefined,
    'AppStore/resetAppState',
  );
};
