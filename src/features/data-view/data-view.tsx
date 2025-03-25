import { TabsPane } from '@features/tabs-pane';
import { useAllTabsQuery, useTabMutation } from '@store/app-idb-store';
import { useCreateQueryFileMutation } from '@store/app-idb-store/useEditorFileQuery';
import { useEffect } from 'react';
import { TabView } from '@features/tab-view';
import { useTabCache } from './useTabCache';

/**
 * Data view component
 */
export const DataView = () => {
  const { data: tabs = [] } = useAllTabsQuery();
  const { mutate } = useTabMutation();
  const { mutateAsync: createQueryFile } = useCreateQueryFileMutation();

  // Use our cache with maximum size of 10 tabs
  const { addToCache, isTabCached } = useTabCache(10);

  // Create a new query tab
  const onCreateQueryTab = async () => {
    const maxOrder = tabs?.length > 0 ? Math.max(...tabs.map((tab) => tab.order)) : -1;
    const newQueryFile = await createQueryFile({
      name: 'query',
    });

    mutate({
      sourceId: newQueryFile.id,
      name: newQueryFile.name,
      type: 'query',
      active: true,
      stable: true,
      state: 'pending',
      order: maxOrder + 1,
      editor: {
        value: '',
        codeSelection: {
          start: 0,
          end: 0,
        },
        undoHistory: [],
      },
      query: {
        state: 'pending',
        originalQuery: '',
      },
      layout: {
        tableColumnWidth: {},
        editorPaneHeight: 0,
        dataViewPaneHeight: 0,
      },
      dataView: {
        data: undefined,
        rowCount: 0,
        columnCount: 0,
      },
      pagination: {
        page: 0,
        limit: 0,
      },
      sort: {
        column: '',
        order: 'desc',
      },
    });
  };

  // Initialize: add active tab to cache
  useEffect(() => {
    const activeTab = tabs.find((tab) => tab.active);
    if (activeTab) {
      addToCache(activeTab.id);
    }
  }, [tabs.map((tab) => tab.active).join(','), addToCache]);

  return (
    <>
      <TabsPane onAddTabClick={onCreateQueryTab} />

      {tabs.map((tab) => {
        // Render only tabs from cache or active tabs
        if (isTabCached(tab.id) || tab.active) {
          // If tab is active but not yet cached - add it
          if (tab.active && !isTabCached(tab.id)) {
            addToCache(tab.id);
          }

          return (
            <div style={{ display: tab.active ? 'block' : 'none' }} className="h-full" key={tab.id}>
              <TabView key={tab.id} id={tab.id} />
            </div>
          );
        }
        return null;
      })}
    </>
  );
};
