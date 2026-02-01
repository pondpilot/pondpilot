import { describe, it, expect, beforeEach } from '@jest/globals';
import { TabId } from '@models/tab';
import {
  useAppStore,
  setPendingConvert,
  clearPendingConvert,
} from '@store/app-store';

describe('pendingConvert state management', () => {
  beforeEach(() => {
    // Clear the pending convert state before each test
    clearPendingConvert();
  });

  it('should initialize with pendingConvert as null', () => {
    clearPendingConvert();
    const state = useAppStore.getState();
    expect(state.pendingConvert).toBeNull();
  });

  it('should set pendingConvert with tabId and format', () => {
    const tabId = 'tab-1' as TabId;
    setPendingConvert(tabId, 'csv');

    const state = useAppStore.getState();
    expect(state.pendingConvert).toEqual({
      tabId: 'tab-1',
      format: 'csv',
    });
  });

  it('should set pendingConvert with parquet format', () => {
    const tabId = 'tab-2' as TabId;
    setPendingConvert(tabId, 'parquet');

    const state = useAppStore.getState();
    expect(state.pendingConvert).toEqual({
      tabId: 'tab-2',
      format: 'parquet',
    });
  });

  it('should clear pendingConvert', () => {
    const tabId = 'tab-1' as TabId;
    setPendingConvert(tabId, 'csv');

    // Verify it was set
    expect(useAppStore.getState().pendingConvert).not.toBeNull();

    clearPendingConvert();
    expect(useAppStore.getState().pendingConvert).toBeNull();
  });

  it('should overwrite existing pendingConvert', () => {
    setPendingConvert('tab-1' as TabId, 'csv');
    setPendingConvert('tab-2' as TabId, 'xlsx');

    const state = useAppStore.getState();
    expect(state.pendingConvert).toEqual({
      tabId: 'tab-2',
      format: 'xlsx',
    });
  });
});
