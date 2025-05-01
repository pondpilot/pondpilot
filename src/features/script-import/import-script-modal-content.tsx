import { showSuccess, showError } from '@components/app-notifications';
import { Button, Group, TextInput, Text, Title, Stack, ActionIcon } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { importScript } from '@utils/script-import-utils';
import { setDataTestId } from '@utils/test-id';
import { useState, useEffect, useRef } from 'react';

interface ImportScriptModalContentProps {
  onClose: () => void;
}

export function ImportScriptModalContent({ onClose }: ImportScriptModalContentProps) {
  const [url, setUrl] = useInputState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <Stack gap={16}>
      <Group justify="space-between">
        <Title order={4}>Import Shared Script</Title>
        <ActionIcon size={20} onClick={handleCancel}>
          <IconX />
        </ActionIcon>
      </Group>

      <Text>Paste the URL of a shared script to add it to your workspace.</Text>

      <TextInput
        ref={inputRef}
        placeholder="https://app.pondpilot.io/shared-script/..."
        value={url}
        onChange={setUrl}
        data-testid={setDataTestId('import-script-url-input')}
        size="sm"
        classNames={{
          input:
            'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full text-sm leading-none px-4 py-2 placeholder-textTertiary-light dark:placeholder-textTertiary-dark focus:border-borderAccent-light dark:focus:border-borderAccent-dark',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && url.trim().includes('/shared-script/') && !isLoading) {
            handleImport();
          }
        }}
      />

      <Group justify="flex-end" gap={4}>
        <Button
          variant="transparent"
          onClick={handleCancel}
          className="rounded-full px-3"
          c="text-secondary"
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          loading={isLoading}
          disabled={!url.trim().includes('/shared-script/')}
          data-testid={setDataTestId('import-script-url-submit-button')}
          color="background-accent"
          className="rounded-full px-3 disabled:bg-transparentBrandBlue-016 dark:disabled:bg-transparentBrandBlue-016 disabled:text-textTertiary-light dark:disabled:text-textTertiary-dark"
        >
          Import
        </Button>
      </Group>
    </Stack>
  );
}
