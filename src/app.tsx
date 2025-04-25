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
import { DuckDBConnectionPoolProvider } from '@features/duckdb-context/duckdb-context';
import { ModifierProvider } from '@components/modifier-context/modifier-context';
import { AppContextProvider } from '@features/app-context';
import { useLocalStorage } from '@mantine/hooks';
import { LOCAL_STORAGE_KEYS } from '@consts/local-storage';
import { InitModals } from '@features/init-modals';
import { Router } from './router/router';

export default function App() {
  const [connectionPoolSize] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.MAX_CONNECTION_POOL_SIZE,
    defaultValue: 30,
  });
  return (
    <MantineProvider theme={theme}>
      <ModalsProvider>
        <ModifierProvider>
          <DuckDBConnectionPoolProvider maxPoolSize={connectionPoolSize}>
            <AppContextProvider>
              <Notifications />
              <AppState />
              <Router />
              <InitModals />
            </AppContextProvider>
          </DuckDBConnectionPoolProvider>
        </ModifierProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
