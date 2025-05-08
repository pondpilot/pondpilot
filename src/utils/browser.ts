import { BrowserSupportedFeatures } from '@models/browser';

import { isMobileDevice } from './is-mobile-device';

export function getBrowserSupportedFeatures(): BrowserSupportedFeatures {
  return {
    isFileAccessApiSupported: 'showDirectoryPicker' in window && 'showOpenFilePicker' in window,
    isMobileDevice: isMobileDevice(),
  };
}
