import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Group, Stack, Title, ActionIcon, Text, Divider, SimpleGrid } from '@mantine/core';
import {
  IconDatabasePlus,
  IconFilePlus,
  IconFolderPlus,
  IconServer,
  IconX,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

import { BaseActionCard } from './components/base-action-card';
import { HttpServerConfig } from './components/http-server-config';
import { RemoteDatabaseConfig } from './components/remote-database-config';

interface DatasourceWizardModalProps {
  onClose: () => void;
  pool: AsyncDuckDBConnectionPool | null;
  handleAddFolder: () => Promise<void>;
  handleAddFile: (exts?: string[]) => Promise<void>;
  initialStep?: WizardStep;
}

export type WizardStep = 'selection' | 'remote-config' | 'http-server-config';

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

  const handleHttpServerClick = () => {
    setStep('http-server-config');
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

  const localDataSources = [
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
  ];

  const remoteDataSources = [
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
      type: 'http-server' as const,
      onClick: handleHttpServerClick,
      icon: (
        <IconServer
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      ),
      title: 'HTTP DB Server',
      description: 'DuckDB HTTP Server',
      testId: 'add-http-server-card',
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
            <Text size="xs">{step === 'remote-config' ? 'REMOTE DATABASE' : 'HTTP DB SERVER'}</Text>
          </Group>
        )}

        <ActionIcon size={24} onClick={onClose} variant="subtle">
          <IconX size={20} />
        </ActionIcon>
      </Group>

      {step === 'selection' && (
        <Stack gap="lg">
          <Group align="flex-start" gap="xl">
            <Stack gap="lg" className="flex-1 min-w-0">
              {/* Local Data Sources Section */}
              <Stack gap="md">
                <Group gap="xs" align="center">
                  <Text size="sm" fw={500} c="text-primary">
                    Local Files
                  </Text>
                  <Text size="xs" c="text-secondary">
                    • Files and folders on your device
                  </Text>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="md">
                  {localDataSources.map((card) => (
                    <BaseActionCard
                      key={card.type}
                      onClick={card.onClick}
                      icon={card.icon}
                      title={card.title}
                      description={card.description}
                      testId={card.testId}
                    />
                  ))}
                </SimpleGrid>
              </Stack>

              <Divider />

              {/* Remote Data Sources Section */}
              <Stack gap="md">
                <Group gap="xs" align="center">
                  <Text size="sm" fw={500} c="text-primary">
                    Remote
                  </Text>
                  <Text size="xs" c="text-secondary">
                    • External databases and servers
                  </Text>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="md">
                  {remoteDataSources.map((card) => (
                    <BaseActionCard
                      key={card.type}
                      onClick={card.onClick}
                      icon={card.icon}
                      title={card.title}
                      description={card.description}
                      testId={card.testId}
                    />
                  ))}
                </SimpleGrid>
              </Stack>
            </Stack>

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
        </Stack>
      )}

      {step === 'remote-config' && (
        <RemoteDatabaseConfig onBack={handleBack} onClose={onClose} pool={pool} />
      )}

      {step === 'http-server-config' && (
        <HttpServerConfig onBack={handleBack} onClose={onClose} pool={pool} />
      )}
    </Stack>
  );
}
