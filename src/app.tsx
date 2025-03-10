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
import { Router } from './router/router';

export default function App() {
  return (
    <MantineProvider theme={theme}>
      <Notifications />
      <AppStatus />

      <AppProvider>
        <Router />
      </AppProvider>
    </MantineProvider>
  );
}
