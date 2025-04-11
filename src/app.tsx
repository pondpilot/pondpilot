import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'allotment/dist/style.css';

import './index.css';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';

import { theme } from '@theme/theme';
import { AppState } from '@features/app-state';
import { DuckDBConnectionProvider } from '@features/duckdb-context/duckdb-context';
import { Router } from './router/router';

export default function App() {
  return (
    <MantineProvider theme={theme}>
      <ModalsProvider>
        <DuckDBConnectionProvider>
          <Notifications />
          <AppState />
          <Router />
        </DuckDBConnectionProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
