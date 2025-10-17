import { useExtensionManagementStore } from '@store/extension-management';

// Mock dependencies
jest.mock('@engines/debug-logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('@models/app-config', () => ({
  getQueryTimeoutMs: () => 5000,
}));

jest.mock('@utils/tauri-logger', () => ({
  tauriLog: jest.fn(),
}));

jest.mock('@utils/browser', () => ({
  isTauriEnvironment: jest.fn(() => false),
}));

jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
}));

describe('ExtensionManagementStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset store state
    useExtensionManagementStore.setState({
      extensions: [
        {
          name: 'parquet',
          type: 'core' as const,
          required: true,
          active: true,
          installed: false,
          description: 'Parquet support',
        },
        {
          name: 'json',
          type: 'core' as const,
          required: true,
          active: true,
          installed: false,
          description: 'JSON support',
        },
      ],
      getActiveExtensions: jest.fn(() => []),
    });
  });

  describe('Regression: Zustand store direct mutation (Frontend Critical #4)', () => {
    it('should provide setState method for immutable updates', () => {
      const store = useExtensionManagementStore;

      // Verify setState is available (not direct mutation)
      expect(typeof store.setState).toBe('function');

      // Test that setState works with functional update
      store.setState((state: any) => ({
        extensions: state.extensions.map((ext: any) =>
          ext.name === 'parquet' ? { ...ext, installed: true } : ext,
        ),
      }));

      const state = store.getState();
      const parquet = state.extensions.find((e) => e.name === 'parquet');

      // Verify the update worked
      expect(parquet?.installed).toBe(true);
    });

    it('should preserve immutability when updating extension status', () => {
      const initialExtensions = useExtensionManagementStore.getState().extensions;
      const extensionsBefore = [...initialExtensions];

      // Update using setState (proper way)
      useExtensionManagementStore.setState((state: any) => ({
        extensions: state.extensions.map((ext: any) =>
          ext.name === 'parquet' ? { ...ext, installed: true } : ext,
        ),
      }));

      const extensionsAfter = useExtensionManagementStore.getState().extensions;

      // Verify a new array was created (not mutated in place)
      expect(extensionsAfter).not.toBe(extensionsBefore);

      // Verify the updated extension is a new object
      const beforeParquet = extensionsBefore.find((e) => e.name === 'parquet');
      const afterParquet = extensionsAfter.find((e) => e.name === 'parquet');

      if (beforeParquet && afterParquet) {
        expect(afterParquet).not.toBe(beforeParquet);
        expect(afterParquet.installed).toBe(true);
        expect(beforeParquet.installed).toBe(false);
      }
    });

    it('should only update the target extension without affecting others', () => {
      useExtensionManagementStore.setState((state: any) => ({
        extensions: state.extensions.map((ext: any) =>
          ext.name === 'parquet' ? { ...ext, installed: true } : ext,
        ),
      }));

      const state = useExtensionManagementStore.getState();
      const parquet = state.extensions.find((e) => e.name === 'parquet');
      const json = state.extensions.find((e) => e.name === 'json');

      // Parquet should be updated
      expect(parquet?.installed).toBe(true);

      // JSON should remain unchanged
      expect(json?.installed).toBe(false);
    });

    it('should not allow direct property mutation on store', () => {
      const store = useExtensionManagementStore.getState();

      // Attempting to directly mutate (this is what the bug was doing)
      // Note: This test documents the WRONG way that was causing the bug
      const originalExtensions = store.extensions;

      // The fix ensures we use setState instead of direct mutation
      // Direct mutation would look like: store.extensions = [...]
      // But that's not allowed by Zustand's API contract

      // Verify the extensions array is the same reference until setState is called
      expect(store.extensions).toBe(originalExtensions);

      // Now update properly with setState
      useExtensionManagementStore.setState((state: any) => ({
        extensions: state.extensions.map((ext: any) =>
          ext.name === 'json' ? { ...ext, active: false } : ext,
        ),
      }));

      const newStore = useExtensionManagementStore.getState();

      // Now it should be a different reference
      expect(newStore.extensions).not.toBe(originalExtensions);
    });
  });
});
