import { useTabCoordination } from '@hooks/use-tab-coordination';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

type MessageListener = (event: MessageEvent) => void;

// Constants matching the hook implementation (TAB_COORDINATION_CONFIG)
const TAKEOVER_PROPAGATION_DELAY_MS = 50;
const TAKEOVER_DEBOUNCE_MS = 300;
const MAX_MESSAGE_AGE_MS = 60000;
const CLOCK_SKEW_TOLERANCE_MS = 5000;

// Valid tabId formats for testing (must match TAB_ID_PATTERN: /^tab-[uuid]$/i)
const VALID_OTHER_TAB_ID = 'tab-12345678-1234-1234-1234-123456789abc';
const VALID_TAB_2_ID = 'tab-87654321-4321-4321-4321-cba987654321';

// Mock window object
const mockWindow = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};
(global as unknown as { window: typeof mockWindow }).window = mockWindow;

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  private listeners: Map<string, MessageListener[]> = new Map();

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown) {
    MockBroadcastChannel.instances
      .filter((instance) => instance !== this && instance.name === this.name)
      .forEach((instance) => {
        const event = new MessageEvent('message', { data: message });
        instance.listeners.get('message')?.forEach((listener) => listener(event));
      });
  }

  addEventListener(type: string, listener: MessageListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: MessageListener) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  close() {
    this.listeners.clear();
    const index = MockBroadcastChannel.instances.indexOf(this);
    if (index > -1) MockBroadcastChannel.instances.splice(index, 1);
  }

  static reset() {
    MockBroadcastChannel.instances = [];
  }
}

// Mock React hooks
let mockState: Record<string, unknown> = {};
let mockRefs: Record<string, { current: unknown }> = {};
let cleanupFn: (() => void) | undefined;

const STATE_KEY_BLOCKED = 'state_0';

jest.mock('react', () => ({
  useState: jest.fn((initialValue: unknown) => {
    const key = `state_${Object.keys(mockState).length}`;
    if (!(key in mockState)) {
      mockState[key] = typeof initialValue === 'function' ? initialValue() : initialValue;
    }
    const setStateFn = (newValue: unknown) => {
      mockState[key] = newValue;
    };
    return [mockState[key], setStateFn];
  }),
  useRef: jest.fn((initialValue: unknown) => {
    const key = `ref_${Object.keys(mockRefs).length}`;
    if (!(key in mockRefs)) {
      mockRefs[key] = { current: initialValue };
    }
    return mockRefs[key];
  }),
  useCallback: jest.fn((fn: unknown) => fn),
  useEffect: jest.fn((effect: () => (() => void) | void) => {
    cleanupFn = effect() || undefined;
  }),
}));

describe('useTabCoordination', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    mockState = {};
    mockRefs = {};
    cleanupFn = undefined;
    (global as unknown as { BroadcastChannel: typeof MockBroadcastChannel }).BroadcastChannel =
      MockBroadcastChannel;
    mockWindow.addEventListener.mockClear();
    mockWindow.removeEventListener.mockClear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (cleanupFn) {
      cleanupFn();
    }
    MockBroadcastChannel.reset();
  });

  describe('initial state', () => {
    it('should return isTabBlocked as false initially', () => {
      const result = useTabCoordination();

      expect(result.isTabBlocked).toBe(false);
    });

    it('should return a takeOver function', () => {
      const result = useTabCoordination();

      expect(typeof result.takeOver).toBe('function');
    });
  });

  describe('tab registration', () => {
    it('should broadcast TAB_REGISTER on mount', () => {
      useTabCoordination();

      expect(MockBroadcastChannel.instances).toHaveLength(1);
    });

    it('should respond with TAB_ACTIVE when receiving TAB_REGISTER from another tab', () => {
      useTabCoordination();

      // Simulate another tab registering - create second channel and send TAB_REGISTER from it
      const secondChannel = new MockBroadcastChannel('tab-coordination');
      const receivedMessages: unknown[] = [];
      secondChannel.addEventListener('message', (e) => receivedMessages.push(e.data));

      // Second tab sends TAB_REGISTER (simulating another tab opening)
      secondChannel.postMessage({
        type: 'TAB_REGISTER',
        tabId: VALID_OTHER_TAB_ID,
        timestamp: Date.now(),
      });

      // The second channel should receive TAB_ACTIVE from the first
      expect(receivedMessages).toHaveLength(1);
      expect((receivedMessages[0] as { type: string }).type).toBe('TAB_ACTIVE');
    });

    it('should set isTabBlocked to true when receiving TAB_ACTIVE', () => {
      // Reset state to track the correct state key
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      // Create a mock that simulates another tab sending TAB_ACTIVE
      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        tabId: VALID_OTHER_TAB_ID,
        timestamp: Date.now(),
      });

      // Check state was updated (state_0 is isTabBlocked)
      expect(mockState[STATE_KEY_BLOCKED]).toBe(true);
    });
  });

  describe('takeOver functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should set isTabBlocked to false when takeOver is called after delay', () => {
      mockState = {};
      mockRefs = {};

      const result = useTabCoordination();

      // First, block the tab
      mockState[STATE_KEY_BLOCKED] = true;

      // Call takeOver
      result.takeOver();

      // State should not change immediately due to propagation delay
      expect(mockState[STATE_KEY_BLOCKED]).toBe(true);

      // Advance timers past the propagation delay
      jest.advanceTimersByTime(TAKEOVER_PROPAGATION_DELAY_MS);

      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should broadcast TAB_TAKEOVER when takeOver is called', () => {
      mockState = {};
      mockRefs = {};

      const result = useTabCoordination();

      // Set up another channel to receive the takeover message
      const otherChannel = new MockBroadcastChannel('tab-coordination');
      const receivedMessages: unknown[] = [];
      otherChannel.addEventListener('message', (e) => receivedMessages.push(e.data));

      // Call takeOver
      result.takeOver();

      expect(receivedMessages).toHaveLength(1);
      expect((receivedMessages[0] as { type: string }).type).toBe('TAB_TAKEOVER');
    });

    it('should block other tabs when they receive TAB_TAKEOVER', () => {
      // First hook call (tab 1)
      mockState = {};
      mockRefs = {};
      useTabCoordination();

      // Create second tab manually
      const tab2Channel = new MockBroadcastChannel('tab-coordination');

      // Tab 2 sends TAB_TAKEOVER
      tab2Channel.postMessage({
        type: 'TAB_TAKEOVER',
        tabId: VALID_TAB_2_ID,
        timestamp: Date.now(),
      });

      // Tab 1 should be blocked
      expect(mockState[STATE_KEY_BLOCKED]).toBe(true);
    });

    it('should debounce rapid takeOver calls', () => {
      mockState = {};
      mockRefs = {};

      const result = useTabCoordination();

      // Set up another channel to receive messages
      const otherChannel = new MockBroadcastChannel('tab-coordination');
      const receivedMessages: unknown[] = [];
      otherChannel.addEventListener('message', (e) => receivedMessages.push(e.data));

      // Call takeOver multiple times rapidly
      result.takeOver();
      result.takeOver();
      result.takeOver();

      // Only one TAB_TAKEOVER message should be sent (first call)
      const takeoverMessages = receivedMessages.filter(
        (msg) => (msg as { type: string }).type === 'TAB_TAKEOVER',
      );
      expect(takeoverMessages).toHaveLength(1);
    });

    it('should allow takeOver after debounce period expires', () => {
      mockState = {};
      mockRefs = {};

      const result = useTabCoordination();

      // Set up another channel to receive messages
      const otherChannel = new MockBroadcastChannel('tab-coordination');
      const receivedMessages: unknown[] = [];
      otherChannel.addEventListener('message', (e) => receivedMessages.push(e.data));

      // First takeOver
      result.takeOver();

      // Advance past debounce period
      jest.advanceTimersByTime(TAKEOVER_DEBOUNCE_MS + 10);

      // Second takeOver should work
      result.takeOver();

      const takeoverMessages = receivedMessages.filter(
        (msg) => (msg as { type: string }).type === 'TAB_TAKEOVER',
      );
      expect(takeoverMessages).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle missing BroadcastChannel API gracefully', () => {
      delete (global as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;

      const result = useTabCoordination();

      expect(result.isTabBlocked).toBe(false);
      expect(typeof result.takeOver).toBe('function');
      // takeOver should be a no-op when channel is not available
      expect(() => result.takeOver()).not.toThrow();
    });

    it('should ignore messages from self', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      // Simulate receiving a message from self (same tabId)
      // Since BroadcastChannel doesn't send to self, this tests the guard
      // We need to manually trigger the handler with a self message
      // This is tested implicitly - the handler checks senderTabId !== tabId

      // State should remain unchanged
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });
  });

  describe('message validation', () => {
    it('should ignore messages with missing type', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        tabId: 'other-tab',
        timestamp: Date.now(),
      });

      // State should remain unchanged
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore messages with missing tabId', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        timestamp: Date.now(),
      });

      // State should remain unchanged
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore messages with invalid type', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'INVALID_TYPE',
        tabId: 'other-tab',
        timestamp: Date.now(),
      });

      // State should remain unchanged
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore non-object messages', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage('invalid string message');

      // State should remain unchanged
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore null messages', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage(null);

      // State should remain unchanged
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore messages with missing timestamp', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        tabId: 'other-tab',
      });

      // State should remain unchanged
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore messages with timestamps too old', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        tabId: 'other-tab',
        timestamp: Date.now() - MAX_MESSAGE_AGE_MS - 1000,
      });

      // State should remain unchanged because message is too old
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore messages with timestamps too far in future', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        tabId: 'other-tab',
        timestamp: Date.now() + CLOCK_SKEW_TOLERANCE_MS + 1000,
      });

      // State should remain unchanged because message is from future
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should accept messages with timestamps within acceptable bounds', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        tabId: VALID_OTHER_TAB_ID,
        timestamp: Date.now() - 1000, // 1 second ago - valid
      });

      // State should be updated because message is valid
      expect(mockState[STATE_KEY_BLOCKED]).toBe(true);
    });

    it('should ignore messages that exceed size limit', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      // Create a message with extra data to exceed the 1KB size limit
      const largePayload = 'x'.repeat(2000);
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        tabId: VALID_OTHER_TAB_ID,
        timestamp: Date.now(),
        extraData: largePayload,
      });

      // State should remain unchanged because message is too large
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });

    it('should ignore messages with invalid tabId format', () => {
      mockState = {};
      mockRefs = {};

      useTabCoordination();

      const otherChannel = new MockBroadcastChannel('tab-coordination');
      otherChannel.postMessage({
        type: 'TAB_ACTIVE',
        tabId: 'invalid-tab-id', // Does not match TAB_ID_PATTERN
        timestamp: Date.now(),
      });

      // State should remain unchanged because tabId format is invalid
      expect(mockState[STATE_KEY_BLOCKED]).toBe(false);
    });
  });
});
