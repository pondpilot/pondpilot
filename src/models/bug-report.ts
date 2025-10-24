export type BugReportCategory =
  | 'crash'
  | 'data-issue'
  | 'ui-bug'
  | 'performance'
  | 'feature-request'
  | 'other';

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
