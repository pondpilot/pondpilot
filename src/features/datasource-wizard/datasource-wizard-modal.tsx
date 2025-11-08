import { showError } from '@components/app-notifications';
import { ConnectionPool } from '@engines/types';
import { Group, Stack, Title, ActionIcon, Text, Button, Alert } from '@mantine/core';
import {
  IconDatabasePlus,
  IconFilePlus,
  IconFolderPlus,
  IconX,
  IconClipboard,
} from '@tabler/icons-react';
import { fileSystemService } from '@utils/file-system-adapter';
import { setDataTestId } from '@utils/test-id';
import { useState, useEffect, useCallback } from 'react';

import { BaseActionCard } from './components/base-action-card';
import { ClipboardImportConfig } from './components/clipboard-import-config';
import { RemoteDatabaseConfig } from './components/remote-database-config';
import { validateJSON, validateCSV } from './utils/clipboard-import';

interface DatasourceWizardModalProps {
  onClose: () => void;
  pool: ConnectionPool | null;
  handleAddFolder: () => Promise<void>;
  handleAddFile: () => Promise<void>;
  initialStep?: WizardStep;
}

export type WizardStep = 'selection' | 'remote-config' | 'clipboard-csv' | 'clipboard-json';

const getStepTitle = (step: WizardStep): string => {
  switch (step) {
    case 'remote-config':
      return 'REMOTE DATABASE';
    case 'clipboard-csv':
      return 'IMPORT CSV FROM CLIPBOARD';
    case 'clipboard-json':
      return 'IMPORT JSON FROM CLIPBOARD';
    default:
      return '';
  }
};

export function DatasourceWizardModal({
  onClose,
  initialStep = 'selection',
  pool,
  handleAddFolder,
  handleAddFile,
}: DatasourceWizardModalProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [hasClipboardContent, setHasClipboardContent] = useState(false);
  const [clipboardContent, setClipboardContent] = useState('');
  const [clipboardFormat, setClipboardFormat] = useState<'csv' | 'json'>('csv');
  const [clipboardPermissionState, setClipboardPermissionState] = useState<
    'unknown' | 'granted' | 'denied' | 'prompt'
  >('unknown');

  const [hasUserCheckedClipboard, setHasUserCheckedClipboard] = useState(false);

  // Detect if browser is Safari or Firefox
  const browserInfo = fileSystemService.getBrowserInfo();
  const isSafariOrFirefox = browserInfo.name === 'Safari' || browserInfo.name === 'Firefox';

  // Check clipboard permission state using Permissions API
  const checkClipboardPermission = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({
          name: 'clipboard-read' as PermissionName,
        });
        setClipboardPermissionState(result.state);
        return result.state;
      }
    } catch (error) {
      setClipboardPermissionState('unknown');
      return 'unknown';
    }
    return 'unknown';
  };

  // Check clipboard content on mount and when window gets focus
  const checkClipboard = useCallback(async () => {
    // First check permission state
    const permissionState = await checkClipboardPermission();
    if (permissionState === 'denied') {
      // Access blocked - don't attempt to read
      setHasClipboardContent(false);
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        // Always attempt to request clipboard access when opening modal
        // This gives users a second chance if they previously denied access
        const text = await navigator.clipboard.readText();
        setHasClipboardContent(!!text && text.trim().length > 0);

        // Save clipboard content for later use if it exists
        if (text && text.trim().length > 0) {
          setClipboardContent(text);
        }

        // Update permission state after successful read
        setClipboardPermissionState('granted');
      }
    } catch (error) {
      setHasClipboardContent(false);

      // If access error, mark as denied
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setClipboardPermissionState('denied');
      }
    }
  }, []);

  const handleCheckClipboard = async () => {
    setHasUserCheckedClipboard(true);
    checkClipboard();
  };

  // Check clipboard permissions and auto-check content if already granted
  useEffect(() => {
    const initializeClipboard = async () => {
      const permissionState = await checkClipboardPermission();

      // For Safari and Firefox, NEVER auto-check clipboard to avoid triggering paste menu
      // They require explicit user gesture even when permission is granted
      if (isSafariOrFirefox) {
        return;
      }

      // For Chrome/Edge: auto-check clipboard if permission already granted or unknown
      if (permissionState === 'granted' || permissionState === 'unknown') {
        setHasUserCheckedClipboard(true);
        await checkClipboard();
      }
    };

    initializeClipboard();
  }, [checkClipboard, isSafariOrFirefox]);

  const handleRemoteDatabaseClick = () => {
    setStep('remote-config');
  };

  const handleBack = () => {
    setStep('selection');
  };

  const handleCardClick = (type: 'file' | 'folder') => (): void => {
    if (type === 'file') {
      handleAddFile();
    } else if (type === 'folder') {
      handleAddFolder();
    }
    onClose();
  };

  const handlePasteAs = async (format: 'csv' | 'json') => {
    if (!pool) {
      showError({
        title: 'App is not ready',
        message: 'Please wait for app to load before importing data',
      });
      return;
    }

    try {
      // Read clipboard content
      const clipboardText = await navigator.clipboard.readText();

      if (!clipboardText.trim()) {
        showError({
          title: 'Empty clipboard',
          message: 'No text found in clipboard',
        });
        return;
      }

      // Validate format
      if (format === 'json') {
        const validation = validateJSON(clipboardText);
        if (!validation.isValid) {
          showError({
            title: 'Invalid JSON',
            message: validation.error || 'The clipboard content is not valid JSON',
          });
          return;
        }
      } else if (format === 'csv') {
        const validation = validateCSV(clipboardText);
        if (!validation.isValid) {
          showError({
            title: 'Invalid CSV',
            message: validation.error || 'The clipboard content does not appear to be valid CSV',
          });
          return;
        }
      }

      // Store clipboard content and navigate to import step
      setClipboardContent(clipboardText);
      setClipboardFormat(format);
      setStep(format === 'csv' ? 'clipboard-csv' : 'clipboard-json');
    } catch (error) {
      console.error('Clipboard access error:', error);
      showError({
        title: 'Cannot access clipboard',
        message: 'Failed to read clipboard content. Please check browser permissions.',
      });
    }
  };

  // Render functions for clipboard alerts
  const renderCheckClipboardBanner = () => {
    if (isSafariOrFirefox) return null;
    if (hasUserCheckedClipboard) return null;
    if (clipboardPermissionState === 'denied' || clipboardPermissionState === 'granted') {
      return null;
    }

    return (
      <Alert
        icon={<IconClipboard size={20} />}
        color="background-accent"
        data-testid={setDataTestId('clipboard-check-banner')}
      >
        <Group justify="space-between" align="center">
          <Text size="sm">You can import data from your clipboard</Text>
          <Button
            size="xs"
            onClick={handleCheckClipboard}
            data-testid={setDataTestId('check-clipboard-button')}
          >
            Check clipboard
          </Button>
        </Group>
      </Alert>
    );
  };

  const renderPasteDataBanner = () => {
    if (!isSafariOrFirefox && !hasClipboardContent) return null;

    return (
      <Alert
        icon={<IconClipboard size={20} />}
        color="background-accent"
        variant="light"
        data-testid={setDataTestId('clipboard-alert')}
      >
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            Paste data from clipboard
          </Text>
          <Group gap={8}>
            <Button
              size="xs"
              onClick={() => handlePasteAs('csv')}
              data-testid={setDataTestId('paste-as-csv')}
            >
              CSV
            </Button>
            <Button
              size="xs"
              onClick={() => handlePasteAs('json')}
              data-testid={setDataTestId('paste-as-json')}
            >
              JSON
            </Button>
          </Group>
        </Group>
      </Alert>
    );
  };

  const renderClipboardBlockedAlert = () => {
    if (isSafariOrFirefox || clipboardPermissionState !== 'denied') return null;

    return (
      <Alert icon={<IconClipboard size={20} />} color="background-accent" variant="light">
        <Stack gap={12} w="100%">
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Clipboard access blocked
            </Text>
            <Text size="xs" c="text-secondary">
              To import data from clipboard, please click the 🔒 icon in your browser&apos;s address
              bar and allow clipboard access.
            </Text>
          </Stack>
        </Stack>
      </Alert>
    );
  };

  const datasourceCards = [
    {
      type: 'file' as const,
      onClick: handleCardClick('file'),
      icon: (
        <IconFilePlus
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      ),
      title: 'Add Files',
      description: 'CSV, Parquet, JSON, Excel',
      testId: 'add-file-card',
    },
    {
      type: 'folder' as const,
      onClick: handleCardClick('folder'),
      icon: (
        <IconFolderPlus
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      ),
      title: 'Add Folder',
      description: 'Browse entire directories',
      testId: 'add-folder-card',
    },
    {
      type: 'remote' as const,
      onClick: handleRemoteDatabaseClick,
      icon: (
        <IconDatabasePlus
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      ),
      title: 'Remote Database',
      description: 'S3, GCS, Azure, HTTPS',
      testId: 'add-remote-database-card',
    },
  ];

  return (
    <Stack className="p-6" gap={24}>
      <Group justify="space-between">
        {step === 'selection' ? (
          <Title order={4}>Add Data Source</Title>
        ) : (
          <Group className="gap-2 pl-4">
            <Text
              component="button"
              onClick={() => setStep('selection')}
              size="xs"
              c="text-secondary"
              data-testid={setDataTestId('back-to-selection')}
            >
              ADD DATA SOURCE
            </Text>
            <Text size="xs">/</Text>
            <Text size="xs">{getStepTitle(step)}</Text>
          </Group>
        )}

        <ActionIcon size={24} onClick={onClose}>
          <IconX size={20} />
        </ActionIcon>
      </Group>

      {step === 'selection' && (
        <Stack gap={16}>
          {renderCheckClipboardBanner()}
          {renderPasteDataBanner()}
          {renderClipboardBlockedAlert()}

          <Group>
            <Group gap="md" className="justify-center md:justify-start">
              {datasourceCards.map((card) => (
                <BaseActionCard
                  key={card.type}
                  onClick={card.onClick}
                  icon={card.icon}
                  title={card.title}
                  description={card.description}
                  testId={card.testId}
                />
              ))}
            </Group>
          </Group>
        </Stack>
      )}

      {step === 'remote-config' && (
        <RemoteDatabaseConfig onBack={handleBack} onClose={onClose} pool={pool} />
      )}

      {(step === 'clipboard-csv' || step === 'clipboard-json') && (
        <ClipboardImportConfig
          content={clipboardContent}
          format={clipboardFormat}
          pool={pool}
          onBack={handleBack}
          onClose={onClose}
        />
      )}
    </Stack>
  );
}
