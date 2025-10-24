import type { FeatureContextType } from '@features/feature-context';
import type { BugReportContext } from '@models/bug-report';
import { useAppStore } from '@store/app-store';
import { isMobileDevice } from '@utils/is-mobile-device';

declare const __VERSION__: string;
declare const __INTEGRATION_TEST__: boolean;

/**
 * Captures comprehensive context about the app state, environment, and errors
 * for bug reporting. Sanitizes all sensitive data (no query text, file paths, API keys).
 */
export function captureBugReportContext(featureContext: FeatureContextType): BugReportContext {
  const store = useAppStore.getState();

  const activeTabError = store.activeTabId
    ? store.tabExecutionErrors.get(store.activeTabId)
    : undefined;
  const tabErrorsArray = Array.from(store.tabExecutionErrors.entries()).map(([tabId, error]) => ({
    tabId,
    message: error.errorMessage,
    timestamp: error.timestamp,
  }));

  return {
    appVersion: __VERSION__,
    timestamp: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      isDevelopment: import.meta.env.DEV,
      isIntegrationTest: typeof __INTEGRATION_TEST__ !== 'undefined' ? __INTEGRATION_TEST__ : false,
    },
    browserFeatures: {
      hasFileSystemAccess: featureContext.hasNativeFileSystemAccess,
      isOPFSSupported: featureContext.isOPFSSupported,
      isMobileDevice: isMobileDevice(),
      hasDragAndDrop: featureContext.hasDragAndDrop,
    },
    appState: {
      loadState: store.appLoadState,
      activeTabId: store.activeTabId,
      totalTabs: store.tabs.size,
      totalDataSources: store.dataSources.size,
      totalScripts: store.sqlScripts.size,
    },
    errors: {
      activeTabError: activeTabError ? activeTabError.errorMessage : null,
      totalTabsWithErrors: store.tabExecutionErrors.size,
      recentErrors: tabErrorsArray.slice(0, 5),
    },
    dataSources: Array.from(store.dataSources.values()).map((ds) => ({
      id: ds.id,
      type: ds.type,
      connectionStatus: 'connectionStatus' in ds ? (ds.connectionStatus as string) : undefined,
    })),
  };
}

/**
 * Formats context as a human-readable string for Slack
 */
export function formatContextForSlack(context: BugReportContext): string {
  const lines: string[] = [];

  lines.push('*Environment:*');
  lines.push(`• Version: ${context.appVersion}`);
  lines.push(`• Browser: ${context.environment.userAgent}`);
  lines.push(`• Platform: ${context.environment.platform}`);
  lines.push(`• Viewport: ${context.environment.viewport}`);
  lines.push(`• Mobile: ${context.browserFeatures.isMobileDevice}`);
  lines.push('');

  lines.push('*App State:*');
  lines.push(`• Load State: ${context.appState.loadState}`);
  lines.push(`• Active Tab: ${context.appState.activeTabId || 'none'}`);
  lines.push(`• Total Tabs: ${context.appState.totalTabs}`);
  lines.push(`• Data Sources: ${context.appState.totalDataSources}`);
  lines.push(`• Scripts: ${context.appState.totalScripts}`);
  lines.push('');

  if (context.errors.totalTabsWithErrors > 0) {
    lines.push('*Errors:*');
    lines.push(`• Tabs with errors: ${context.errors.totalTabsWithErrors}`);
    if (context.errors.activeTabError) {
      lines.push(
        `• Active tab error: ${context.errors.activeTabError.substring(0, 200)}${context.errors.activeTabError.length > 200 ? '...' : ''}`,
      );
    }
    lines.push('');
  }

  lines.push('*Browser Features:*');
  lines.push(`• File System Access: ${context.browserFeatures.hasFileSystemAccess}`);
  lines.push(`• OPFS: ${context.browserFeatures.isOPFSSupported}`);
  lines.push(`• Drag & Drop: ${context.browserFeatures.hasDragAndDrop}`);

  return lines.join('\n');
}
