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
