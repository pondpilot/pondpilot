import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Group, Stack, Title, ActionIcon, Text, Divider } from '@mantine/core';
import {
  IconDatabasePlus,
  IconFilePlus,
  IconFolderPlus,
  IconX,
  IconCloud,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

import { BaseActionCard } from './components/base-action-card';
import { MotherDuckConfig } from './components/motherduck-config';
import { RemoteDatabaseConfig } from './components/remote-database-config';

interface DatasourceWizardModalProps {
  onClose: () => void;
  pool: AsyncDuckDBConnectionPool | null;
  handleAddFolder: () => Promise<void>;
  handleAddFile: (exts?: string[]) => Promise<void>;
  initialStep?: WizardStep;
}

export type WizardStep = 'selection' | 'remote-config' | 'motherduck-config';

export function DatasourceWizardModal({
  onClose,
  initialStep = 'selection',
  pool,
  handleAddFolder,
  handleAddFile,
}: DatasourceWizardModalProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);

  const handleRemoteDatabaseClick = () => {
    setStep('remote-config');
  };

  const handleMotherDuckClick = () => {
    setStep('motherduck-config');
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
    {
      type: 'motherduck' as const,
      onClick: handleMotherDuckClick,
      icon: (
        <IconCloud
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      ),
      title: 'MotherDuck',
      description: 'Cloud DuckDB service',
      testId: 'add-motherduck-card',
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
            <Text size="xs">{step === 'remote-config' ? 'REMOTE DATABASE' : 'MOTHERDUCK'}</Text>
          </Group>
        )}

        <ActionIcon size={24} onClick={onClose} variant="subtle">
          <IconX size={20} />
        </ActionIcon>
      </Group>

      {step === 'selection' && (
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

          <Divider orientation="vertical" visibleFrom="md" />

          <Stack w={200} visibleFrom="md">
            <Text size="xs" c="text-secondary">
              💡 Tips:
            </Text>
            <Text size="xs" className="pl-3" c="text-secondary">
              • Drag and drop files or folders directly into the app
            </Text>
            <Text size="xs" className="pl-3" c="text-secondary">
              • Use SQL ATTACH statement for advanced database connections
            </Text>
            <Text size="xs" className="pl-3" c="text-secondary">
              • Supported formats: CSV, Parquet, JSON, Excel, DuckDB, and more
            </Text>
          </Stack>
        </Group>
      )}

      {step === 'remote-config' && (
        <RemoteDatabaseConfig onBack={handleBack} onClose={onClose} pool={pool} />
      )}

      {step === 'motherduck-config' && <MotherDuckConfig onBack={handleBack} onClose={onClose} />}
    </Stack>
  );
}
