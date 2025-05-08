import { BrowserSupportedFeatures } from '@models/browser';
import { getBrowserSupportedFeatures } from '@utils/browser';
import { createContext, useContext } from 'react';

import { DevModal } from './components/dev-modal';
import { useAppInitialization } from './hooks/use-init-application';

interface AppContextType {
  browserInfo: BrowserSupportedFeatures;
}

// As of today this is static, so we do not even bother to create it
// inside the context provider, although as we add more app context stuff
// this may go into the provider
const appContextValue = {
  browserInfo: getBrowserSupportedFeatures(),
};

const AppContext = createContext<AppContextType>(appContextValue);

export const AppContextProvider = ({ children }: { children: React.ReactNode }) => {
  useAppInitialization(appContextValue.browserInfo);

  return (
    <AppContext.Provider value={appContextValue}>
      {import.meta.env.DEV && appContextValue.browserInfo.isFileAccessApiSupported && <DevModal />}
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
