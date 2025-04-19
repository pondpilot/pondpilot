import { BrowserSupportedFeatures } from '@models/browser';

export function getBrowserSupportedFeatures(): BrowserSupportedFeatures {
  return {
    isFileAccessApiSupported: 'showDirectoryPicker' in window && 'showOpenFilePicker' in window,
  };
}
