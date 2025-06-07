import React, { createContext, useContext, useMemo } from 'react';

import { useTabCoordination } from '@hooks/use-tab-coordination';
import { getBrowserSupportedFeatures } from '@utils/browser';
import { isPersistenceSupported } from '@utils/duckdb-persistence';

interface FeatureContextType {
  isFileAccessApiSupported: boolean;
  isMobileDevice: boolean;
  isOPFSSupported: boolean;
  isTabBlocked: boolean;
}

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
  const isTabBlocked = useTabCoordination();

  const contextValue = useMemo(() => {
    const browserFeatures = getBrowserSupportedFeatures();
    const isOPFSSupported = isPersistenceSupported();

    const features: FeatureContextType = {
      isFileAccessApiSupported: browserFeatures.isFileAccessApiSupported,
      isMobileDevice: browserFeatures.isMobileDevice,
      isOPFSSupported,
      isTabBlocked,
    };

    return features;
  }, [isTabBlocked]);

  return <FeatureContext.Provider value={contextValue}>{children}</FeatureContext.Provider>;
};
