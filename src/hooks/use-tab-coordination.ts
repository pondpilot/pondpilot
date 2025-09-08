import { isTauriEnvironment } from '@utils/browser';
import { useEffect, useState } from 'react';
import { v4 } from 'uuid';

const TAB_COORDINATION_CHANNEL = 'tab-coordination';

interface TabCoordinationMessage {
  type: 'TAB_REGISTER' | 'TAB_ACTIVE';
  tabId: string;
  timestamp: number;
}

/**
 * Hook for coordinating tabs using BroadcastChannel API
 * In Tauri, multiple windows are allowed as they share the same backend
 */
export const useTabCoordination = (): boolean => {
  const [isTabBlocked, setIsTabBlocked] = useState(false);
  const [tabId] = useState(() => `tab-${v4()}`);

  useEffect(() => {
    // In Tauri, multiple windows are allowed as they share the same Rust backend
    if (isTauriEnvironment()) {
      return;
    }

    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    const channel = new BroadcastChannel(TAB_COORDINATION_CHANNEL);
    let isThisTabActive = true;

    const handleMessage = (event: MessageEvent<TabCoordinationMessage>) => {
      const { type, tabId: senderTabId } = event.data;

      switch (type) {
        case 'TAB_REGISTER':
          if (isThisTabActive && senderTabId !== tabId) {
            channel.postMessage({
              type: 'TAB_ACTIVE',
              tabId,
              timestamp: Date.now(),
            } as TabCoordinationMessage);
          }
          break;

        case 'TAB_ACTIVE':
          if (senderTabId !== tabId) {
            isThisTabActive = false;
            setIsTabBlocked(true);
          }
          break;
      }
    };

    channel.addEventListener('message', handleMessage);

    channel.postMessage({
      type: 'TAB_REGISTER',
      tabId,
      timestamp: Date.now(),
    } as TabCoordinationMessage);

    const cleanup = () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };

    window.addEventListener('beforeunload', cleanup);

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', cleanup);
    };
  }, [tabId]);

  return isTabBlocked;
};
