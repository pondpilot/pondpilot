import { useAppStore, useTabTypeMap } from '@store/app-store';
import { useEffect } from 'react';
import { Stack } from '@mantine/core';
import { ErrorBoundary } from 'react-error-boundary';
import { deleteTab } from '@controllers/tab';
import { ScriptTabView } from './components/script-tab-view';
import { FileDataSourceTabView } from './components/file-data-source-tab-view';
import { useTabCache } from './hooks/use-tab-cache';
import { TabErrorFallback } from './components';

const TAB_CACHE_SIZE = 10;

export const TabView = () => {
  const tabToTypeMap = useTabTypeMap();
  const activeTabId = useAppStore.use.activeTabId();

  // Use tab cache t avoid rendering all tabs at once
  const { addToCache, isTabCached } = useTabCache(TAB_CACHE_SIZE);

  // Initialize: add active tab to cache
  useEffect(() => {
    if (activeTabId === null) return;
    addToCache(activeTabId);
  }, [activeTabId, addToCache]);

  return (
    <Stack className="h-full gap-0">
      {Array.from(tabToTypeMap.entries()).map(([tabId, tabType]) => {
        const isActive = tabId === activeTabId;
        if (isTabCached(tabId) || isActive) {
          if (isActive && !isTabCached(tabId)) {
            addToCache(tabId);
          }
          return (
            <div key={tabId} className={`flex-1 min-h-0 ${isActive ? 'block' : 'hidden'}`}>
              <ErrorBoundary
                FallbackComponent={TabErrorFallback}
                onReset={() => {
                  if (activeTabId === null) return;
                  deleteTab([activeTabId]);
                }}
              >
                {tabType === 'script' && <ScriptTabView tabId={tabId} active={isActive} />}
                {tabType === 'data-source' && (
                  <FileDataSourceTabView tabId={tabId} active={isActive} />
                )}
              </ErrorBoundary>
            </div>
          );
        }
        return null;
      })}
    </Stack>
  );
};
