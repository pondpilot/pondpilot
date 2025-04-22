import { useState, useEffect } from 'react';
import { Button, Group, TextInput, Text, Stack } from '@mantine/core';
import { showSuccess, showError } from '@components/app-notifications';
import { importScript } from '@utils/script-import-utils';

interface ImportScriptModalContentProps {
  onClose: () => void;
}

export function ImportScriptModalContent({ onClose }: ImportScriptModalContentProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      const inputElement = document.querySelector('[data-autofocus="true"]') as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
      }
    }, 100);
  }, []);

  const handleCancel = () => {
    setUrl('');
    onClose();
  };

  const handleImport = async () => {
    setIsLoading(true);

    try {
      const result = await importScript(url, true);

      if (result.success) {
        showSuccess({
          title: result.title,
          message: result.message,
        });
        onClose();
      } else {
        showError({
          title: result.title,
          message: result.message,
        });
      }
    } catch (error) {
      console.error('Error importing script:', error);
      showError({
        title: 'Import failed',
        message: 'An unexpected error occurred while importing the script.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack>
      <Text size="sm">Paste the URL of a shared script to import it into your workspace.</Text>

      <TextInput
        label="Shared Script URL"
        placeholder="https://app.pondpilot.io/shared-script/..."
        value={url}
        onChange={(event) => setUrl(event.currentTarget.value)}
        data-autofocus="true"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Enter' && url.trim().includes('/shared-script/') && !isLoading) {
            handleImport();
          }
        }}
      />

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          loading={isLoading}
          disabled={!url.trim().includes('/shared-script/')}
        >
          Import
        </Button>
      </Group>
    </Stack>
  );
}
