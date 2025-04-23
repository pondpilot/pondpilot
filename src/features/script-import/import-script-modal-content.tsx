import { useState, useEffect, useRef } from 'react';
import { Button, Group, TextInput, Text, Stack } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { showSuccess, showError } from '@components/app-notifications';
import { importScript } from '@utils/script-import-utils';

interface ImportScriptModalContentProps {
  onClose: () => void;
}

export function ImportScriptModalContent({ onClose }: ImportScriptModalContentProps) {
  const [url, setUrl] = useInputState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
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
      <Text size="sm" c="text-primary">
        Paste the URL of a shared script to import it into your workspace.
      </Text>

      <TextInput
        ref={inputRef}
        label="Shared Script URL"
        placeholder="https://app.pondpilot.io/shared-script/..."
        value={url}
        onChange={setUrl}
        autoFocus
        classNames={{
          input: 'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md',
          label: 'text-textSecondary-light dark:text-textSecondary-dark text-sm mb-1',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && url.trim().includes('/shared-script/') && !isLoading) {
            handleImport();
          }
        }}
      />

      <Group justify="flex-end" mt="md">
        <Button
          variant="default"
          onClick={handleCancel}
          className="rounded-full px-3"
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          loading={isLoading}
          disabled={!url.trim().includes('/shared-script/')}
          color="background-accent"
          className="rounded-full px-3 min-w-20 font-normal"
        >
          Import
        </Button>
      </Group>
    </Stack>
  );
}
