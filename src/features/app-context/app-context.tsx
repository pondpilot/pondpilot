import { createContext, useContext } from 'react';

import { useFeatureContext } from '@features/feature-context';

import { DevModal } from './components/dev-modal';
import { useAppInitialization } from './hooks/use-init-application';

// As of today this is static, so we do not even bother to create it
// inside the context provider, although as we add more app context stuff
// this may go into the provider

const AppContext = createContext({});

export const AppContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { isFileAccessApiSupported, isMobileDevice } = useFeatureContext();
  useAppInitialization({
    isFileAccessApiSupported,
    isMobileDevice,
  });

  return (
    <AppContext.Provider value={{}}>
      {import.meta.env.DEV && isFileAccessApiSupported && <DevModal />}
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
