import { Button } from '@mantine/core';
import { useEffect, useState } from 'react';

export function TauriTest() {
  const [isTauri, setIsTauri] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Check if running in Tauri
    setIsTauri('__TAURI__' in window);
  }, []);

  const testConnection = async () => {
    if (!isTauri) {
      setMessage('Not running in Tauri');
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api' as any);
      const result = await invoke('test_connection');
      setMessage(result as string);
    } catch (error) {
      setMessage(`Error: ${error}`);
    }
  };

  const testGreet = async () => {
    if (!isTauri) {
      setMessage('Not running in Tauri');
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api' as any);
      const result = await invoke('greet', { name: 'PondPilot User' });
      setMessage(result as string);
    } catch (error) {
      setMessage(`Error: ${error}`);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3>Tauri Integration Test</h3>
      <p>Running in Tauri: {isTauri ? 'Yes' : 'No'}</p>
      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <Button onClick={testConnection} disabled={!isTauri}>
          Test Connection
        </Button>
        <Button onClick={testGreet} disabled={!isTauri}>
          Test Greet
        </Button>
      </div>
      {message && (
        <p
          style={{ marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px' }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
