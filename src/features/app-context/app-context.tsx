import { useFeatureContext } from '@features/feature-context';
import { useTabCoordinationContext } from '@features/tab-coordination-context';
import { useBeforeUnloadProtection } from '@hooks/use-beforeunload-protection';
import { createContext, useContext } from 'react';

import { DevModal } from './components/dev-modal';
import { useAppInitialization } from './hooks/use-init-application';

// As of today this is static, so we do not even bother to create it
// inside the context provider, although as we add more app context stuff
// this may go into the provider

const AppContext = createContext({});

export const AppContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { isFileAccessApiSupported, isMobileDevice } = useFeatureContext();
  const { isTabBlocked } = useTabCoordinationContext();
  useAppInitialization({
    isFileAccessApiSupported,
    isMobileDevice,
    isTabBlocked,
  });

  // Add protection against losing file references in non-Chrome browsers
  useBeforeUnloadProtection();

  return (
    <AppContext.Provider value={{}}>
      {import.meta.env.DEV && isFileAccessApiSupported && !isTabBlocked && <DevModal />}
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
