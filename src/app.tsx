import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'allotment/dist/style.css';

import './index.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AppProvider } from '@features/app-context';

import { theme } from '@theme/theme';
import { AppStatus } from '@features/app-status';
import { BrowserNotSupported } from '@components/browser-not-supported';
import { useAppStore } from '@store/app-store';
import { useEffect } from 'react';
import { ModalsProvider } from '@mantine/modals';
import { OnboardingModal } from '@components/onboarding-modal';
import { WhatsNewModal } from '@components/whats-new-modal';
import { StartModal } from '@features/start-modal';
import { Router } from './router/router';

const isFileAccessApiSupported = 'showDirectoryPicker' in window && 'showOpenFilePicker' in window;

export default function App() {
  const setAppStatus = useAppStore((state) => state.setAppStatus);

  useEffect(() => {
    if (!isFileAccessApiSupported) {
      setAppStatus('unsupported-browser');
    }
  }, []);

  return (
    <MantineProvider theme={theme}>
      <ModalsProvider
        modals={{
          onboarding: OnboardingModal,
          whatsNew: WhatsNewModal,
        }}
      >
        <Notifications />
        <AppStatus />
        <StartModal />
        {isFileAccessApiSupported ? (
          <AppProvider>
            <Router />
          </AppProvider>
        ) : (
          <BrowserNotSupported />
        )}
      </ModalsProvider>
    </MantineProvider>
  );
}
