import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 } from 'uuid';

const TAB_COORDINATION_CHANNEL = 'tab-coordination';

/**
 * Configuration constants for tab coordination timing.
 *
 * TAKEOVER_PROPAGATION_DELAY_MS: Small delay after broadcasting a takeover message
 * before updating local state. This ensures other tabs receive and process the
 * message before this tab starts initializing resources, preventing race conditions.
 *
 * TAKEOVER_DEBOUNCE_MS: Minimum interval between takeover attempts to prevent
 * rapid-fire takeover spam from UI double-clicks or programmatic errors.
 *
 * MAX_MESSAGE_AGE_MS: Maximum age for valid coordination messages. Messages older
 * than this are rejected to prevent replay attacks and stale message processing.
 *
 * MAX_MESSAGE_SIZE_BYTES: Maximum allowed size for coordination messages to prevent
 * resource exhaustion from malformed or malicious messages.
 */
const TAB_COORDINATION_CONFIG = {
  TAKEOVER_PROPAGATION_DELAY_MS: 50,
  TAKEOVER_DEBOUNCE_MS: 300,
  MAX_MESSAGE_AGE_MS: 60000,
  MAX_MESSAGE_SIZE_BYTES: 1024,
} as const;

type TabMessageType = 'TAB_REGISTER' | 'TAB_ACTIVE' | 'TAB_TAKEOVER';

interface TabCoordinationMessage {
  type: TabMessageType;
  tabId: string;
  timestamp: number;
}

/**
 * Regex pattern for validating tabId format.
 * Expected format: "tab-" followed by a UUID v4 (e.g., "tab-550e8400-e29b-41d4-a716-446655440000")
 */
const TAB_ID_PATTERN = /^tab-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a message has the expected structure for tab coordination.
 * Includes security checks for message age and size to prevent replay attacks
 * and resource exhaustion.
 */
const isValidTabMessage = (data: unknown): data is TabCoordinationMessage => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check message size to prevent resource exhaustion
  try {
    const messageSize = JSON.stringify(data).length;
    if (messageSize > TAB_COORDINATION_CONFIG.MAX_MESSAGE_SIZE_BYTES) {
      console.warn('Tab coordination message rejected: exceeds size limit');
      return false;
    }
  } catch {
    // JSON.stringify can fail on circular references or other edge cases
    console.warn('Tab coordination message rejected: failed to serialize for size check');
    return false;
  }

  const message = data as Record<string, unknown>;

  if (typeof message.type !== 'string' || typeof message.tabId !== 'string') {
    return false;
  }

  const validTypes: TabMessageType[] = ['TAB_REGISTER', 'TAB_ACTIVE', 'TAB_TAKEOVER'];
  if (!validTypes.includes(message.type as TabMessageType)) {
    return false;
  }

  // Validate tabId format to prevent injection attacks via logs/display
  if (!TAB_ID_PATTERN.test(message.tabId)) {
    console.warn('Tab coordination message rejected: invalid tabId format');
    return false;
  }

  if (typeof message.timestamp !== 'number') {
    return false;
  }

  // Validate timestamp is within acceptable bounds to prevent replay attacks
  // Allow small clock skew (5 seconds into the future)
  const now = Date.now();
  const { MAX_MESSAGE_AGE_MS } = TAB_COORDINATION_CONFIG;
  const CLOCK_SKEW_TOLERANCE_MS = 5000;

  if (message.timestamp < now - MAX_MESSAGE_AGE_MS) {
    console.warn('Tab coordination message rejected: too old');
    return false;
  }

  if (message.timestamp > now + CLOCK_SKEW_TOLERANCE_MS) {
    console.warn('Tab coordination message rejected: timestamp in future');
    return false;
  }

  return true;
};

export interface TabCoordinationResult {
  isTabBlocked: boolean;
  takeOver: () => void;
}

/**
 * Hook for coordinating tabs using BroadcastChannel API
 */
export const useTabCoordination = (): TabCoordinationResult => {
  const [isTabBlocked, setIsTabBlocked] = useState(false);
  const [tabId] = useState(() => `tab-${v4()}`);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const isThisTabActiveRef = useRef(true);
  const takeoverDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takeoverDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    const channel = new BroadcastChannel(TAB_COORDINATION_CHANNEL);
    channelRef.current = channel;
    isThisTabActiveRef.current = true;

    const handleMessage = (event: MessageEvent) => {
      if (!isValidTabMessage(event.data)) {
        return;
      }

      const { type, tabId: senderTabId } = event.data;

      switch (type) {
        case 'TAB_REGISTER':
          if (isThisTabActiveRef.current && senderTabId !== tabId) {
            channel.postMessage({
              type: 'TAB_ACTIVE',
              tabId,
              timestamp: Date.now(),
            } as TabCoordinationMessage);
          }
          break;

        case 'TAB_ACTIVE':
        case 'TAB_TAKEOVER':
          if (senderTabId !== tabId) {
            isThisTabActiveRef.current = false;
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
      channelRef.current = null;
      isThisTabActiveRef.current = false;
      if (takeoverDebounceRef.current) {
        clearTimeout(takeoverDebounceRef.current);
        takeoverDebounceRef.current = null;
      }
      if (takeoverDelayRef.current) {
        clearTimeout(takeoverDelayRef.current);
        takeoverDelayRef.current = null;
      }
    };

    window.addEventListener('beforeunload', cleanup);

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', cleanup);
    };
  }, [tabId]);

  const takeOver = useCallback(() => {
    if (!channelRef.current) {
      return;
    }

    // Debounce rapid takeover attempts
    if (takeoverDebounceRef.current) {
      return;
    }

    takeoverDebounceRef.current = setTimeout(() => {
      takeoverDebounceRef.current = null;
    }, TAB_COORDINATION_CONFIG.TAKEOVER_DEBOUNCE_MS);

    try {
      // Broadcast first to ensure other tabs receive the message before local state changes
      channelRef.current.postMessage({
        type: 'TAB_TAKEOVER',
        tabId,
        timestamp: Date.now(),
      } as TabCoordinationMessage);

      // Clear any existing propagation delay timeout to prevent memory leaks
      if (takeoverDelayRef.current) {
        clearTimeout(takeoverDelayRef.current);
      }

      // Add small delay to allow message propagation before updating local state
      takeoverDelayRef.current = setTimeout(() => {
        isThisTabActiveRef.current = true;
        setIsTabBlocked(false);
        takeoverDelayRef.current = null;
      }, TAB_COORDINATION_CONFIG.TAKEOVER_PROPAGATION_DELAY_MS);
    } catch (error) {
      console.error('Failed to take over tab coordination:', error);
    }
  }, [tabId]);

  return { isTabBlocked, takeOver };
};
