type BrowserSupportedFeatures = {
  isFileAccessApiSupported: boolean;
};

export function getBrowserSupportedFeatures(): BrowserSupportedFeatures {
  return {
    isFileAccessApiSupported: 'showDirectoryPicker' in window && 'showOpenFilePicker' in window,
  };
}
