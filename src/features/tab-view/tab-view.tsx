import { useAppStore } from '@store/app-store';
import { useEffect } from 'react';
import { ScriptTabView } from './views/script-tab-view';
import { FileDataSourceTabView } from './views/file-data-source-tab-view';
import { useTabCache } from './hooks/useTabCache';

const TAB_CACHE_SIZE = 10;

export const TabView = () => {
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
    <>
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
              {tab.type === 'script' && <ScriptTabView tab={tab} active={isActive} />}
              {tab.type === 'data-source' && <FileDataSourceTabView tab={tab} visible={isActive} />}
            </div>
          );
        }
        return null;
      })}
    </>
  );
};
