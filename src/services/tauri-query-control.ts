import { isTauriEnvironment } from '@utils/browser';

export async function interruptNativeQuery(connectionId: string): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('interrupt_connection', { connectionId });
  } catch (error) {
    console.warn('Failed to interrupt native DuckDB query', error);
  }
}
