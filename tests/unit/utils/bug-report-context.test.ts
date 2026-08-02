import { describe, expect, it } from '@jest/globals';
import type { BugReportContext } from '@models/bug-report';
import { formatContextForSlack } from '@utils/bug-report-context';

const makeContext = (): BugReportContext => ({
  appVersion: 'v0.10.0',
  timestamp: '2026-08-02T12:00:00.000Z',
  environment: {
    userAgent: 'Test Browser',
    platform: 'Test Platform',
    language: 'en',
    viewport: '984x780',
    isDevelopment: false,
    isIntegrationTest: false,
  },
  browserFeatures: {
    hasFileSystemAccess: true,
    isOPFSSupported: true,
    isMobileDevice: false,
    hasDragAndDrop: true,
  },
  appState: {
    loadState: 'ready',
    activeTabId: 'tab-1',
    totalTabs: 2,
    totalDataSources: 2,
    totalScripts: 2,
  },
  errors: {
    activeTabError: 'Not implemented Error: InMemory not implemented yet',
    totalTabsWithErrors: 1,
    recentErrors: [],
  },
  dataSources: [
    { id: 'source-1', type: 'quack', connectionState: 'connected' },
    { id: 'source-2', type: 'csv' },
  ],
});

describe('bug report context formatting', () => {
  it('includes safe data-source types and connection states without source identifiers', () => {
    const formatted = formatContextForSlack(makeContext());

    expect(formatted).toContain('*Data Sources:*');
    expect(formatted).toContain('• quack (connected)');
    expect(formatted).toContain('• csv');
    expect(formatted).not.toContain('source-1');
    expect(formatted).not.toContain('source-2');
  });
});
