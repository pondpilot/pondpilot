import { Stack, Group, Button, Text } from '@mantine/core';
import React from 'react';
import { FallbackProps } from 'react-error-boundary';
import { exportApplicationFiles } from '@utils/helpers';
import { deleteApplicationData } from '../utils';

export const AppErrorFallback = ({ error }: FallbackProps) => {
  const exportArchive = async () => {
    const archiveBlob = await exportApplicationFiles();
    if (archiveBlob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archiveBlob);
      link.download = 'application_files.zip';
      link.click();
    } else {
      console.error('Failed to export files.');
    }
  };

  return (
    <div role="alert">
      <Stack p="lg">
        <Text size="xl">Something went wrong 🤷‍♂️</Text>
        <Text>
          <pre className="bg-zinc-200">{error.message}</pre>
          <pre className="bg-zinc-200">{error.stack}</pre>
        </Text>
        <Text size="xl">What you can do to fix the error:</Text>
        <Text size="md">1. Reload the page</Text>
        <Text size="md">
          2. If the error persists, <b>export application data</b>. This action will collect all
          application files and download them as a ZIP archive. When you export the data, you can
          safely delete the application data.
        </Text>
        <Group>
          <Button onClick={exportArchive}>Export application data</Button>
          <Button variant="outline" color="red" onClick={deleteApplicationData}>
            Delete application data
          </Button>
        </Group>
      </Stack>
    </div>
  );
};
