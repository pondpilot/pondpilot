import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'allotment/dist/style.css';

import './index.css';
import './styles/tauri-native.css';

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
import { isTauriEnvironment } from '@utils/browser';
import { useEffect } from 'react';

import { Router } from './router/router';

export default function App() {
  const [connectionPoolSize] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.MAX_CONNECTION_POOL_SIZE,
    defaultValue: 30,
  });

  useEffect(() => {
    // Add Tauri-specific classes to body for native styling
    if (isTauriEnvironment()) {
      document.body.classList.add('tauri-desktop');

      // Detect OS for platform-specific styling
      try {
        if (window.__TAURI__) {
          const { os } = window.__TAURI__;
          if (os && os.platform) {
            os.platform().then((platform: string) => {
              if (platform === 'darwin') {
                document.body.classList.add('tauri-macos');
              } else if (platform === 'win32') {
                document.body.classList.add('tauri-windows');
              } else {
                document.body.classList.add('tauri-linux');
              }
            }).catch((err: any) => {
              console.warn('Failed to detect platform:', err);
            });
          }
        }
      } catch (err) {
        console.warn('Failed to access Tauri API:', err);
      }
    }
  }, []);

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
