import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import './styles/tauri-native.css';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { SecretsManager } from '@pages/secrets-manager/secrets-manager';
import { theme } from '@theme/theme';
import { isTauriEnvironment } from '@utils/browser';
import { useEffect } from 'react';

export function SecretsApp() {
  useEffect(() => {
    // Add Tauri-specific classes for native styling
    if (isTauriEnvironment()) {
      document.body.classList.add('tauri-desktop', 'secrets-window');

      // Detect OS for platform-specific styling
      try {
        if (window.__TAURI__) {
          const { os } = window.__TAURI__;
          if (os && os.platform) {
            os.platform()
              .then((platform: string) => {
                if (platform === 'darwin') {
                  document.body.classList.add('tauri-macos');
                } else if (platform === 'win32') {
                  document.body.classList.add('tauri-windows');
                } else {
                  document.body.classList.add('tauri-linux');
                }
              })
              .catch((err: unknown) => {
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
        <Notifications />
        <SecretsManager />
      </ModalsProvider>
    </MantineProvider>
  );
}
