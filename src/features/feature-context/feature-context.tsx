import { getBrowserSupportedFeatures } from '@utils/browser';
import { isPersistenceSupported } from '@utils/duckdb-persistence';
import { fileSystemService } from '@utils/file-system-adapter';
import React, { createContext, useContext, useMemo } from 'react';

export type FeatureContextType = {
  // Legacy flag (kept for backward compatibility)
  isFileAccessApiSupported: boolean;

  // Granular file system capabilities
  hasNativeFileSystemAccess: boolean;
  canPickFiles: boolean;
  canPickMultipleFiles: boolean;
  canPickDirectories: boolean;
  canPersistFileHandles: boolean;
  canWriteToFiles: boolean;
  hasDragAndDrop: boolean;

  // Other features
  isMobileDevice: boolean;
  isOPFSSupported: boolean;
};

const FeatureContext = createContext<FeatureContextType | null>(null);

export const useFeatureContext = (): FeatureContextType => {
  const context = useContext(FeatureContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return context;
};

/**
 * FeatureProvider component provides the available features of the browser.
 */
export const FeatureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const contextValue = useMemo(() => {
    const browserFeatures = getBrowserSupportedFeatures();
    const isOPFSSupported = isPersistenceSupported();

    // Get granular capabilities from the file system service
    const capabilities = fileSystemService.getBrowserCapabilities();

    // Legacy flag - true if we can access files in any way (native or fallback)
    const canAccessFileSystem =
      capabilities.hasNativeFileSystemAccess || capabilities.hasFallbackFileAccess;

    const features: FeatureContextType = {
      // Legacy flag (kept for backward compatibility)
      isFileAccessApiSupported: canAccessFileSystem,

      // Granular file system capabilities
      hasNativeFileSystemAccess: capabilities.hasNativeFileSystemAccess,
      canPickFiles: capabilities.canPickFiles,
      canPickMultipleFiles: capabilities.canPickMultipleFiles,
      canPickDirectories: capabilities.canPickDirectories,
      canPersistFileHandles: capabilities.canPersistFileHandles,
      canWriteToFiles: capabilities.canWriteToFiles,
      hasDragAndDrop: capabilities.hasDragAndDrop,

      // Other features
      isMobileDevice: browserFeatures.isMobileDevice,
      isOPFSSupported,
    };

    return features;
  }, []);

  return <FeatureContext.Provider value={contextValue}>{children}</FeatureContext.Provider>;
};
