import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'allotment/dist/style.css';

import './index.css';

import { ModifierProvider } from '@components/modifier-context/modifier-context';
import { AppContextProvider } from '@features/app-context';
import { AppState } from '@features/app-state';
import { PersistenceConnector } from '@features/duckdb-persistence-context';
import { FeatureProvider } from '@features/feature-context';
import { InitModals } from '@features/init-modals';
import { MantineProvider } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { theme } from '@theme/theme';
import React from 'react';

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
          <FeatureProvider>
            <PersistenceConnector maxPoolSize={connectionPoolSize}>
              <AppContextProvider>
                <Notifications />
                <AppState />
                <Router />
                <InitModals />
              </AppContextProvider>
            </PersistenceConnector>
          </FeatureProvider>
        </ModifierProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
