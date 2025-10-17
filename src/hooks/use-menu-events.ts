import { listen } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '@utils/browser';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useMenuEvents() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauriEnvironment()) return;

    const unlistenPromises: Promise<() => void>[] = [];

    // Listen for menu events from Tauri backend
    unlistenPromises.push(
      listen('menu:preferences', () => {
        navigate('/settings');
      }),
    );

    unlistenPromises.push(
      listen('menu:new_tab', () => {
        // Emit event to create new tab
        window.dispatchEvent(new CustomEvent('create-new-tab'));
      }),
    );

    unlistenPromises.push(
      listen('menu:close_tab', () => {
        // Emit event to close current tab
        window.dispatchEvent(new CustomEvent('close-current-tab'));
      }),
    );

    unlistenPromises.push(
      listen('menu:open_file', () => {
        // Emit event to open file
        window.dispatchEvent(new CustomEvent('open-file'));
      }),
    );

    unlistenPromises.push(
      listen('menu:save', () => {
        // Emit event to save current tab
        window.dispatchEvent(new CustomEvent('save-current-tab'));
      }),
    );

    unlistenPromises.push(
      listen('menu:export', () => {
        // Emit event to export data
        window.dispatchEvent(new CustomEvent('export-data'));
      }),
    );

    unlistenPromises.push(
      listen('menu:find', () => {
        // Emit event to show find dialog
        window.dispatchEvent(new CustomEvent('show-find'));
      }),
    );

    unlistenPromises.push(
      listen('menu:toggle_sidebar', () => {
        // Emit event to toggle sidebar
        window.dispatchEvent(new CustomEvent('toggle-sidebar'));
      }),
    );

    unlistenPromises.push(
      listen('menu:execute_query', () => {
        // Emit event to execute query
        window.dispatchEvent(new CustomEvent('execute-query'));
      }),
    );

    unlistenPromises.push(
      listen('menu:cancel_query', () => {
        // Emit event to cancel query
        window.dispatchEvent(new CustomEvent('cancel-query'));
      }),
    );

    unlistenPromises.push(
      listen('menu:refresh_schema', () => {
        // Emit event to refresh schema
        window.dispatchEvent(new CustomEvent('refresh-schema'));
      }),
    );

    unlistenPromises.push(
      listen('menu:connect_database', () => {
        // Emit event to show connect database dialog
        window.dispatchEvent(new CustomEvent('connect-database'));
      }),
    );

    unlistenPromises.push(
      listen('menu:disconnect_database', () => {
        // Emit event to disconnect database
        window.dispatchEvent(new CustomEvent('disconnect-database'));
      }),
    );

    // Cleanup listeners on unmount
    return () => {
      Promise.all(unlistenPromises).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, [navigate]);
}
