import { BrowserSupportedFeatures } from '@models/browser';

import { isMobileDevice } from './is-mobile-device';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
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
