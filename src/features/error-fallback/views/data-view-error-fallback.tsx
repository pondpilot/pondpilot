import { Stack, Text } from '@mantine/core';
import { useDidUpdate } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { FallbackProps } from 'react-error-boundary';
import { useAppStore } from '@store/app-store';

export const DataViewErrorFallback = ({ error }: FallbackProps) => {
  const currentView = useAppStore((state) => state.currentView);
  const currentQuery = useAppStore((state) => state.currentQuery);
  const [instanceWithErrors, setInstanceWithErrors] = useState('');

  useDidUpdate(() => {
    window.location.reload();
  }, [currentView, currentQuery]);

  useEffect(() => {
    setInstanceWithErrors(currentView || currentQuery || '');
  }, []);

  return (
    <div role="alert">
      <Stack p="lg">
        <Text size="xl">Error displaying data 🤷‍♂️</Text>
        <Text size="md">
          File that may have caused the error: <b>{instanceWithErrors}</b>
        </Text>
        <Text>
          <pre className="bg-zinc-200">{error.message}</pre>
          <pre className="bg-zinc-200">{error.stack}</pre>
        </Text>
        <Text size="xl">What you can do to fix the error:</Text>
        <Text size="md">1. Reload the page</Text>
        <Text size="md">
          2. If the error persists, try to delete or deselect query/view that may have caused the
          error.
        </Text>
      </Stack>
    </div>
  );
};
