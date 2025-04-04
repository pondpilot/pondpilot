import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'allotment/dist/style.css';

import './index.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import { theme } from '@theme/theme';
import { AppState } from '@features/app-state';
import { Router } from './router/router';

export default function App() {
  return (
    <MantineProvider theme={theme}>
      <Notifications />
      <AppState />
      <Router />
    </MantineProvider>
  );
}
