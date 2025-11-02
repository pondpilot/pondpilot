export type BugReportCategory =
  | 'crash'
  | 'data-issue'
  | 'ui-bug'
  | 'performance'
  | 'feature-request'
  | 'other';

// Centralized category metadata to avoid duplication across UI and Slack service.
export const BUG_REPORT_CATEGORY_META: Record<BugReportCategory, { label: string; emoji: string }> =
  {
    crash: { label: 'Crash / Error', emoji: '💥' },
    'data-issue': { label: 'Data Issue', emoji: '📊' },
    'ui-bug': { label: 'UI Bug', emoji: '🐛' },
    performance: { label: 'Performance', emoji: '⚡' },
    'feature-request': { label: 'Feature Request', emoji: '💡' },
    other: { label: 'Other', emoji: '❓' },
  };

export const BUG_REPORT_CATEGORY_OPTIONS = (
  Object.keys(BUG_REPORT_CATEGORY_META) as BugReportCategory[]
).map((key) => ({
  value: key,
  label: BUG_REPORT_CATEGORY_META[key].label,
}));

export interface BugReportFormData {
  category: BugReportCategory;
  description: string;
  email?: string;
  includeContext: boolean;
}

export interface BugReportContext {
  appVersion: string;
  timestamp: string;
  environment: {
    userAgent: string;
    platform: string;
    language: string;
    viewport: string;
    isDevelopment: boolean;
    isIntegrationTest: boolean;
  };
  browserFeatures: {
    hasFileSystemAccess: boolean;
    isOPFSSupported: boolean;
    isMobileDevice: boolean;
    hasDragAndDrop: boolean;
  };
  appState: {
    loadState: string;
    activeTabId: string | null;
    totalTabs: number;
    totalDataSources: number;
    totalScripts: number;
  };
  errors: {
    activeTabError: string | null;
    totalTabsWithErrors: number;
    recentErrors: Array<{
      tabId: string;
      message: string;
      timestamp: number;
    }>;
  };
  dataSources: Array<{
    id: string;
    type: string;
    connectionStatus?: string;
  }>;
}

export interface BugReportPayload {
  formData: BugReportFormData;
  context?: BugReportContext;
}
