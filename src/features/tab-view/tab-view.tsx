import { deleteTab } from '@controllers/tab';
import { ComparisonTabView } from '@features/comparison';
import { NotebookTabView } from '@features/notebook/notebook-tab-view';
import { Skeleton, Stack } from '@mantine/core';
import { useAppStore, useTabTypeMap } from '@store/app-store';
import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { TabErrorFallback } from './components';
import { useTabCache } from './hooks/use-tab-cache';
import { FileDataSourceTabView, SchemaTabView, ScriptTabView } from './views';

const TAB_CACHE_SIZE = 10;

export const TabView = () => {
  const tabToTypeMap = useTabTypeMap();
  const activeTabId = useAppStore.use.activeTabId();
  const appLoadState = useAppStore.use.appLoadState();

  // Use tab cache t avoid rendering all tabs at once
  const { addToCache, isTabCached } = useTabCache(TAB_CACHE_SIZE);

  // Initialize: add active tab to cache
  useEffect(() => {
    if (activeTabId === null) return;
    addToCache(activeTabId);
  }, [activeTabId, addToCache]);

  if (appLoadState !== 'ready') {
    return (
      <Stack className="h-full gap-0 p-4" justify="center" align="center">
        <Skeleton width="60%" height={24} />
        <Skeleton width="100%" height="100%" radius="md" />
      </Stack>
    );
  }

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
                {tabType === 'schema-browser' && <SchemaTabView tabId={tabId} active={isActive} />}
                {tabType === 'comparison' && <ComparisonTabView tabId={tabId} active={isActive} />}
                {tabType === 'notebook' && <NotebookTabView tabId={tabId} active={isActive} />}
              </ErrorBoundary>
            </div>
          );
        }
        return null;
      })}
    </Stack>
  );
};
