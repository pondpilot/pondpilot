import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'allotment/dist/style.css';

import './index.css';

import { BrowserNotSupported } from '@components/browser-not-supported';
import { AppProvider } from '@features/app-context';
import { AppStatus } from '@features/app-status';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import { useAppStore } from '@store/app-store';
import { theme } from '@theme/theme';
import { useEffect } from 'react';
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
      <Notifications />
      <AppStatus />

      {isFileAccessApiSupported ? (
        <AppProvider>
          <Router />
        </AppProvider>
      ) : (
        <BrowserNotSupported />
      )}
    </MantineProvider>
  );
}
