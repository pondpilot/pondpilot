import { useState, useEffect, useRef } from 'react';
import { Button, Group, TextInput, Text, Stack, Box } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { IconFileImport } from '@tabler/icons-react';
import { showSuccess, showError } from '@components/app-notifications';
import { importScript } from '@utils/script-import-utils';

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
    <Box px="md">
      <Group align="center" mb="sm" gap="xs">
        <IconFileImport size={18} className="text-iconDefault-light dark:text-iconDefault-dark" />
        <Text size="sm" fw={500} c="text-primary">
          Import Shared Script
        </Text>
      </Group>

      <Text size="sm" c="text-secondary" mb="md">
        Paste the URL of a shared script to import it into your workspace.
      </Text>

      <TextInput
        ref={inputRef}
        placeholder="https://app.pondpilot.io/shared-script/..."
        value={url}
        onChange={setUrl}
        autoFocus
        size="md"
        classNames={{
          input:
            'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 placeholder-textTertiary-light dark:placeholder-textTertiary-dark',
          wrapper: 'mb-6',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && url.trim().includes('/shared-script/') && !isLoading) {
            handleImport();
          }
        }}
      />

      <Group justify="flex-end" mt="lg" mb="xs">
        <Button
          variant="default"
          onClick={handleCancel}
          className="rounded-full px-3 text-sm"
          size="xs"
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          loading={isLoading}
          disabled={!url.trim().includes('/shared-script/')}
          color="background-accent"
          className="rounded-full px-3 min-w-20 font-normal text-sm"
          size="xs"
        >
          Import
        </Button>
      </Group>
    </Box>
  );
}
