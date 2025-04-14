import { TabsPane } from '@features/tabs-pane';
import { Stack } from '@mantine/core';
import { StartGuide } from '@features/tab-view/components';
import { useAppStore } from '@store/app-store';
import { useEffect } from 'react';
import { TabFactory } from '@features/tab-view/tab-factory';
import { useTabCache } from './useTabCache';

const TAB_CACHE_SIZE = 10;

export const ContentView = () => {
  const tabs = useAppStore.use.tabs();
  const activeTabId = useAppStore.use.activeTabId();

  // Use tab cache t avoid rendering all tabs at once
  const { addToCache, isTabCached } = useTabCache(TAB_CACHE_SIZE);

  // Initialize: add active tab to cache
  useEffect(() => {
    if (activeTabId === null) return;
    addToCache(activeTabId);
  }, [activeTabId, addToCache]);

  return (
    <Stack gap={0} className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      <TabsPane />
      {tabs.size === 0 ? (
        <div className="h-full">
          <StartGuide />
        </div>
      ) : null}
      {Array.from(tabs.values()).map((tab) => {
        const isActive = tab.id === activeTabId;
        // Render only tabs from cache or active tabs
        if (isTabCached(tab.id) || isActive) {
          // If tab is active but not yet cached - add it
          if (isActive && !isTabCached(tab.id)) {
            addToCache(tab.id);
          }

          return (
            <div
              style={{ display: isActive ? 'block' : 'none', height: 'calc(100% - 36px)' }}
              key={tab.id}
            >
              <TabFactory key={tab.id} tab={tab} active={isActive} />
            </div>
          );
        }
        return null;
      })}
    </Stack>
  );
};
