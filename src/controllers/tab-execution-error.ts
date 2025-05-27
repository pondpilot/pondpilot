import { TabId } from '@models/tab';

export interface TabExecutionError {
  errorMessage: string;
  statementType?: string;
  timestamp: number;
}

const tabExecutionErrors = new Map<TabId, TabExecutionError>();

export const setTabExecutionError = (tabId: TabId, error: TabExecutionError): void => {
  tabExecutionErrors.set(tabId, error);
};

export const getTabExecutionError = (tabId: TabId): TabExecutionError | undefined => {
  return tabExecutionErrors.get(tabId);
};

export const clearTabExecutionError = (tabId: TabId): void => {
  tabExecutionErrors.delete(tabId);
};

export const clearAllTabExecutionErrors = (): void => {
  tabExecutionErrors.clear();
};
