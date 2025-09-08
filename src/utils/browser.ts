import { BrowserSupportedFeatures } from '@models/browser';

import { isMobileDevice } from './is-mobile-device';

export function isTauriEnvironment(): boolean {
  // Check multiple indicators for Tauri environment
  return (
    typeof window !== 'undefined' &&
    ('__TAURI__' in window ||
      window.navigator.userAgent.includes('Tauri') ||
      // Also check for Tauri-specific globals that might be available
      '__TAURI_INTERNALS__' in window)
  );
}

export function getBrowserSupportedFeatures(): BrowserSupportedFeatures {
  // In Tauri, we don't need browser-specific file access APIs
  if (isTauriEnvironment()) {
    return {
      isFileAccessApiSupported: true,
      isMobileDevice: false,
    };
  }

  return {
    isFileAccessApiSupported: 'showDirectoryPicker' in window && 'showOpenFilePicker' in window,
    isMobileDevice: isMobileDevice(),
  };
}

/**
 * Best-effort platform detection without Tauri API.
 * Returns a Node.js-like platform string: 'darwin' | 'win32' | 'linux'.
 */
export function detectPlatform(): 'darwin' | 'win32' | 'linux' {
  if (typeof navigator === 'undefined') return 'linux';
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();

  if (platform.includes('mac') || ua.includes('mac os') || ua.includes('macintosh')) {
    return 'darwin';
  }
  if (platform.includes('win') || ua.includes('windows')) {
    return 'win32';
  }
  return 'linux';
}
