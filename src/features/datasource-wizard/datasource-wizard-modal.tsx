import { Group, Stack, Title, ActionIcon, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { FileCard } from './components/file-card';
import { FolderCard } from './components/folder-card';
import { RemoteDatabaseCard } from './components/remote-database-card';
import { RemoteDatabaseConfig } from './components/remote-database-config';

interface DatasourceWizardModalProps {
  onClose: () => void;
  handleAddFile: () => Promise<void>;
  handleAddFolder: () => Promise<void>;
  initialStep?: WizardStep;
}

type WizardStep = 'selection' | 'remote-config';

export function DatasourceWizardModal({
  onClose,
  handleAddFile,
  handleAddFolder,
  initialStep = 'selection',
}: DatasourceWizardModalProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);

  const handleRemoteDatabaseClick = () => {
    setStep('remote-config');
  };

  const handleBack = () => {
    setStep('selection');
  };

  return (
    <Stack className="p-6" gap={20}>
      <Group justify="space-between" className="mb-2">
        <Title order={3}>Add Data Source</Title>
        <ActionIcon size={24} onClick={onClose} variant="subtle">
          <IconX size={20} />
        </ActionIcon>
      </Group>

      {step === 'selection' && (
        <>
          <Text c="text-secondary" size="sm">
            Choose how you want to add data to PondPilot
          </Text>

          <div className="grid grid-cols-3 gap-4">
            <FileCard onClose={onClose} handleAddFile={handleAddFile} />
            <FolderCard onClose={onClose} handleAddFolder={handleAddFolder} />
            <RemoteDatabaseCard onClick={handleRemoteDatabaseClick} />
          </div>

          <Stack gap={8} className="mt-4">
            <Text size="xs" c="text-tertiary">
              💡 Tips:
            </Text>
            <Text size="xs" c="text-tertiary" className="pl-6">
              • Drag and drop files or folders directly into the app
            </Text>
            <Text size="xs" c="text-tertiary" className="pl-6">
              • Use SQL ATTACH statement for advanced database connections
            </Text>
            <Text size="xs" c="text-tertiary" className="pl-6">
              • Supported formats: CSV, Parquet, JSON, Excel, DuckDB, and more
            </Text>
          </Stack>
        </>
      )}

      {step === 'remote-config' && <RemoteDatabaseConfig onBack={handleBack} onClose={onClose} />}
    </Stack>
  );
}
