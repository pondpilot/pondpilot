import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'allotment/dist/style.css';

import './index.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AppProvider } from '@features/app-context';

import { theme } from '@theme/theme';
import { AppState } from '@features/app-status';
import { BrowserNotSupported } from '@components/browser-not-supported';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from './router/router';

const isFileAccessApiSupported = 'showDirectoryPicker' in window && 'showOpenFilePicker' in window;

export default function App() {
  return (
    <MantineProvider theme={theme}>
      <Notifications />
      <AppState />

      {isFileAccessApiSupported ? (
        <QueryClientProvider client={new QueryClient()}>
          <AppProvider>
            <Router />
          </AppProvider>
        </QueryClientProvider>
      ) : (
        <BrowserNotSupported />
      )}
    </MantineProvider>
  );
}
