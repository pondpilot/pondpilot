import { Stack, Group, NumberInput, Text } from '@mantine/core';
import { getQueryTimeoutMs, setQueryTimeoutMs } from '@models/app-config';
import { useState, useEffect } from 'react';

export const QueryTimeoutSettings = () => {
  const [timeoutMs, setTimeoutMs] = useState<number>(30000);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTimeoutMs(getQueryTimeoutMs());
  }, []);

  const onChange = (value: number | string) => {
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!Number.isFinite(num)) return;
    setTimeoutMs(num);
    if (num < 1000 || num > 10 * 60 * 1000) {
      setError('Please choose between 1,000 and 600,000 ms (10 minutes).');
    } else {
      setError(null);
      setQueryTimeoutMs(num);
    }
  };

  return (
    <Stack>
      <Group justify="space-between" className="max-w-md">
        <div>
          <Text c="text-primary" size="sm" fw={500}>
            Query timeout (milliseconds)
          </Text>
          <Text c="text-secondary" size="xs">
            Affects desktop query execution timeouts.
          </Text>
        </div>
        <NumberInput
          value={timeoutMs}
          min={1000}
          max={10 * 60 * 1000}
          step={1000}
          onChange={onChange}
          clampBehavior="strict"
        />
      </Group>
      {error && (
        <Text c="text-error" size="xs">
          {error}
        </Text>
      )}
    </Stack>
  );
};
