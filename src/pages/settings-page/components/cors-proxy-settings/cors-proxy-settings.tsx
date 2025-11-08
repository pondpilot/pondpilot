import { Stack, Switch, Button, Group, Text, Alert } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import {
  getCorsProxySettings,
  saveCorsProxySettings,
  testCorsProxy,
  CorsProxyBehavior,
  CorsProxySettings as CorsProxySettingsType,
} from '@utils/cors-proxy-config';
import { useState } from 'react';

export const CorsProxySettings = () => {
  const [settings, setSettings] = useState(getCorsProxySettings());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const isManualMode = settings.behavior === 'manual';

  const handleToggleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newBehavior: CorsProxyBehavior = event.currentTarget.checked ? 'manual' : 'auto';
    const newSettings: CorsProxySettingsType = { ...settings, behavior: newBehavior };
    setSettings(newSettings);
    saveCorsProxySettings(newSettings);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const isHealthy = await testCorsProxy();
      setTestResult(isHealthy ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Stack gap="md">
      <Switch
        checked={isManualMode}
        onChange={handleToggleChange}
        label={
          <div>
            <Text size="sm" fw={500}>
              Manual mode
            </Text>
            <Text size="xs" c="dimmed">
              {isManualMode
                ? 'Direct connections only. Use proxy: prefix to force proxy for specific databases'
                : 'Automatically use CORS proxy when needed (recommended)'}
            </Text>
          </div>
        }
      />

      <Group>
        <Button onClick={handleTest} loading={testing} size="xs" variant="outline">
          Test Proxy Connection
        </Button>
        {testResult === 'success' && (
          <Text size="sm" c="green">
            ✓ Proxy is healthy
          </Text>
        )}
        {testResult === 'error' && (
          <Text size="sm" c="red">
            ✗ Proxy is not responding
          </Text>
        )}
      </Group>

      {isManualMode && (
        <Alert icon={<IconInfoCircle size={16} />} variant="outline">
          <Stack gap="xs">
            <Text size="sm">
              In manual mode, use the{' '}
              <Text span className="font-mono" c="dimmed">
                proxy:
              </Text>{' '}
              prefix to force proxy usage:
            </Text>
            <Text size="xs" c="dimmed" className="font-mono">
              ATTACH &apos;proxy:https://example.com/db.duckdb&apos; AS mydb
            </Text>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
};
