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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from './router/router';

const isFileAccessApiSupported = 'showDirectoryPicker' in window && 'showOpenFilePicker' in window;
const queryClient = new QueryClient();

export default function App() {
  const setAppStatus = useAppStore((state) => state.setAppStatus);

  useEffect(() => {
    if (!isFileAccessApiSupported) {
      setAppStatus('unsupported-browser');
    }
  }, []);

  return (
    <MantineProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <Notifications />
        <AppStatus />

        {isFileAccessApiSupported ? (
          <AppProvider>
            <Router />
          </AppProvider>
        ) : (
          <BrowserNotSupported />
        )}
      </QueryClientProvider>
    </MantineProvider>
  );
}
