import { TabsPane } from '@features/tabs-pane';
import { useAllTabsQuery, useCreateTabMutation } from '@store/app-idb-store';
import { useCreateQueryFileMutation } from '@store/app-idb-store/useEditorFileQuery';
import { useEffect } from 'react';
import { TabView } from '@features/tab-view';
import { Stack } from '@mantine/core';
import { StartGuide } from '@features/tab-view/components';
import { useTabCache } from './useTabCache';

/**
 * Data view component
 */
export const ContentView = () => {
  const { data: tabs = [] } = useAllTabsQuery();
  const { mutate } = useCreateTabMutation();
  const { mutateAsync: createQueryFile } = useCreateQueryFileMutation();

  // Use our cache with maximum size of 10 tabs
  const { addToCache, isTabCached } = useTabCache(10);

  // Create a new query tab
  const onCreateQueryTab = async () => {
    const newQueryFile = await createQueryFile({ name: 'query' });

    mutate({
      sourceId: newQueryFile.id,
      name: newQueryFile.name,
      type: 'query',
      active: true,
      stable: true,
      state: 'pending',
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
    <Stack gap={0} className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      {tabs.length === 0 ? (
        <div className="h-full">
          <StartGuide />
        </div>
      ) : null}
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
    </Stack>
  );
};
