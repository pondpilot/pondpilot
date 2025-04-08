import { TabsPane } from '@features/tabs-pane';
import { TabView } from '@features/tab-view';
import { Stack } from '@mantine/core';
import { StartGuide } from '@features/tab-view/components';
import { useInitStore } from '@store/init-store';
import { AnyTab } from '@models/tab';
import { useEffect } from 'react';
import { useTabCache } from './useTabCache';

export const ContentView = () => {
  const tabs = useInitStore.use.tabs();
  const tabsOrder = useInitStore.use.tabOrder();
  const activeTabId = useInitStore.use.activeTabId();

  const orderedTabs = tabsOrder.reduce((acc, id) => {
    const tab = tabs.get(id);
    if (tab) {
      acc.push(tab);
    } else {
      console.warn(`Tab with id ${id} is present in ordered tabs but not found in tabs map.`);
    }

    return acc;
  }, [] as AnyTab[]);

  // Use our cache with maximum size of 10 tabs
  const { addToCache, isTabCached } = useTabCache(10);

  // Initialize: add active tab to cache
  useEffect(() => {
    if (activeTabId === null) return;
    const activeTab = tabs.get(activeTabId);
    if (activeTab) {
      addToCache(activeTab.id);
    }
  }, [activeTabId, addToCache, tabs]);

  return (
    <Stack gap={0} className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      <TabsPane />
      {orderedTabs.length === 0 ? (
        <div className="h-full">
          <StartGuide />
        </div>
      ) : null}
      {orderedTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        // Render only tabs from cache or active tabs
        if (isTabCached(tab.id) || isActive) {
          // If tab is active but not yet cached - add it
          if (isActive && !isTabCached(tab.id)) {
            addToCache(tab.id);
          }

          return (
            <div style={{ display: isActive ? 'block' : 'none' }} className="h-full" key={tab.id}>
              <TabView key={tab.id} tab={tab} active={isActive} />
            </div>
          );
        }
        return null;
      })}
    </Stack>
  );
};
