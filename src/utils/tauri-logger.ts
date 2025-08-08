import { isTauriEnvironment } from '@utils/browser';

// Helper to log to both console and Tauri's console (visible in terminal)
export function tauriLog(...args: any[]) {
  // Always log to browser console
  console.log(...args);

  // Also log to Tauri's stdout if in Tauri environment
  if (isTauriEnvironment()) {
    const message = args
      .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
      .join(' ');

    // Lazy import to avoid bundling Tauri API in web build
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('log_message', { message });
      } catch {
        // Ignore errors silently
      }
    })();
  }
}

// Export as default console replacement for Tauri
export const tauriConsole = {
  log: tauriLog,
  error: (...args: any[]) => {
    console.error(...args);
    tauriLog('[ERROR]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
    tauriLog('[WARN]', ...args);
  },
  info: (...args: any[]) => {
    console.info(...args);
    tauriLog('[INFO]', ...args);
  },
  debug: (...args: any[]) => {
    console.debug(...args);
    tauriLog('[DEBUG]', ...args);
  },
};
