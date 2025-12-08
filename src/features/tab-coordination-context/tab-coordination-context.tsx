import { useTabCoordination, TabCoordinationResult } from '@hooks/use-tab-coordination';
import React, { createContext, useContext } from 'react';

const TabCoordinationContext = createContext<TabCoordinationResult | null>(null);

/**
 * Hook to access tab coordination state and actions.
 *
 * @throws Error if used outside of TabCoordinationProvider
 * @returns Tab coordination state (isTabBlocked) and actions (takeOver)
 */
export const useTabCoordinationContext = (): TabCoordinationResult => {
  const context = useContext(TabCoordinationContext);
  if (!context) {
    throw new Error('useTabCoordinationContext must be used within a TabCoordinationProvider');
  }
  return context;
};

/**
 * Provider component for tab coordination state.
 *
 * This provider should be placed high in the component tree, before any
 * components that need to check if the tab is blocked or perform takeover.
 */
export const TabCoordinationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const coordination = useTabCoordination();

  return (
    <TabCoordinationContext.Provider value={coordination}>
      {children}
    </TabCoordinationContext.Provider>
  );
};
