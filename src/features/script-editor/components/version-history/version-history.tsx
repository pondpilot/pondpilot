import { showAlert } from '@components/app-notifications';
import { LoadingOverlay } from '@components/loading-overlay';
import { createScriptVersionController } from '@controllers/script-version';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  ScrollArea,
  Stack,
  Text,
  Timeline,
  Tooltip,
  TextInput,
  Textarea,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { ScriptVersion, ScriptVersionGroup } from '@models/script-version';
import { SQLScriptId } from '@models/sql-script';
import { useAppStore } from '@store/app-store';
import {
  IconClock,
  IconPlayerPlay,
  IconTag,
  IconRestore,
  IconEdit,
  IconX,
  IconCopy,
} from '@tabler/icons-react';
import { formatDate, formatDateTime, formatTime } from '@utils/date-formatters';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useState } from 'react';

interface VersionHistoryProps {
  scriptId: SQLScriptId;
  onRestore: (version: ScriptVersion) => void;
  onClose: () => void;
}

const groupVersionsByDate = (versions: ScriptVersion[]): ScriptVersionGroup[] => {
  const groups = new Map<string, ScriptVersion[]>();

  versions.forEach((version) => {
    const date = new Date(version.timestamp);
    const dateKey = date.toDateString();

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(version);
  });

  return Array.from(groups.entries())
    .map(([dateKey, versionList]) => ({
      date: new Date(dateKey),
      versions: versionList.sort((a, b) => b.timestamp - a.timestamp),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
};

const VersionTypeIcon = ({ type }: { type: ScriptVersion['type'] }) => {
  switch (type) {
    case 'run':
      return <IconPlayerPlay size={16} />;
    case 'named':
      return <IconTag size={16} />;
    case 'manual':
      return <IconTag size={16} />;
    default:
      return <IconClock size={16} />;
  }
};

const VersionTypeLabel = ({ type }: { type: ScriptVersion['type'] }) => {
  switch (type) {
    case 'run':
      return 'Query Run';
    case 'named':
      return 'Named Version';
    case 'manual':
      return 'Manual Save';
    default:
      return 'Auto-save';
  }
};

interface RenameVersionFormProps {
  initialName: string;
  initialDescription: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
}

const RenameVersionForm = ({
  initialName,
  initialDescription,
  onSubmit,
  onCancel,
}: RenameVersionFormProps) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  return (
    <Stack>
      <TextInput
        label="Version Name"
        placeholder="e.g., Before refactoring, v1.0, Working version"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        required
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && name.trim()) {
            onSubmit(name, description);
          }
        }}
      />
      <Textarea
        label="Description (optional)"
        placeholder="Add notes about this version..."
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        minRows={3}
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          color="background-accent"
          onClick={() => onSubmit(name, description)}
          disabled={!name.trim()}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
};

export const VersionHistory = ({ scriptId, onRestore, onClose }: VersionHistoryProps) => {
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<ScriptVersion | null>(null);
  const iDbConn = useAppStore((state) => state._iDbConn);

  const handleRestoreVersion = (version: ScriptVersion) => {
    modals.openConfirmModal({
      title: 'Restore Version',
      children: (
        <Text size="sm">
          Are you sure you want to restore this version from {formatDateTime(version.timestamp)}?
          This will replace your current script content.
        </Text>
      ),
      labels: { confirm: 'Restore', cancel: 'Cancel' },
      confirmProps: { color: 'background-accent' },
      onConfirm: () => onRestore(version),
    });
  };

  const handleCopyVersion = async (version: ScriptVersion) => {
    try {
      await navigator.clipboard.writeText(version.content);
      showAlert({
        title: 'Copied to clipboard',
        message: 'Version content copied successfully',
        autoClose: 2000,
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      showAlert({
        title: 'Failed to copy',
        message: 'Could not copy to clipboard',
        color: 'red',
      });
    }
  };

  const handleRenameVersion = (version: ScriptVersion) => {
    const initialName = version.name || '';
    const initialDescription = version.description || '';

    const modalId = modals.open({
      title: 'Name This Version',
      children: (
        <RenameVersionForm
          initialName={initialName}
          initialDescription={initialDescription}
          onSubmit={async (name, description) => {
            if (!name.trim() || !iDbConn) return;

            try {
              const controller = createScriptVersionController(iDbConn);
              await controller.updateVersionNameAndDescription(
                version.id,
                name.trim(),
                description.trim() || undefined,
              );

              // Reload versions
              const updatedVersions = await controller.getVersionsByScriptId(scriptId);
              setVersions(updatedVersions);

              // Update selected version if it was renamed
              if (selectedVersion?.id === version.id) {
                const updated = updatedVersions.find((v) => v.id === version.id);
                if (updated) setSelectedVersion(updated);
              }

              showAlert({
                title: 'Version Named',
                message: `Version named "${name.trim()}"`,
                autoClose: 3000,
              });

              modals.close(modalId);
            } catch (error) {
              console.error('Failed to rename version:', error);
              showAlert({
                title: 'Error',
                message: 'Failed to rename version',
                color: 'red',
              });
            }
          }}
          onCancel={() => modals.close(modalId)}
        />
      ),
    });
  };

  useEffect(() => {
    const loadVersions = async () => {
      if (!iDbConn) return;

      setLoading(true);
      try {
        const controller = createScriptVersionController(iDbConn);
        const loadedVersions = await controller.getVersionsByScriptId(scriptId);
        setVersions(loadedVersions);
      } catch (error) {
        console.error('Failed to load versions:', error);
        setLoading(false);
        // Show error message to user
        showAlert({
          title: 'Failed to load version history',
          message: 'Unable to retrieve version history. Please try again.',
          color: 'red',
          autoClose: 5000,
        });
      } finally {
        setLoading(false);
      }
    };

    loadVersions();
  }, [scriptId, iDbConn]);

  const versionGroups = groupVersionsByDate(versions);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Fixed header */}
      <div className="px-6 py-4 border-b border-borderPrimary-light dark:border-borderPrimary-dark bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark z-10">
        <Group justify="space-between">
          <Text size="lg" fw={600}>
            Version History
          </Text>
          <ActionIcon onClick={onClose} data-testid={setDataTestId('version-history-close-button')}>
            <IconX />
          </ActionIcon>
        </Group>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 flex gap-2 overflow-hidden px-6 py-4">
        <div className={`${selectedVersion ? 'w-1/2' : 'flex-1'} overflow-hidden`}>
          <ScrollArea className="h-full">
            <div className="pr-4">
              <LoadingOverlay visible={loading} />
              {!loading && versions.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">
                  No version history available
                </Text>
              )}

              {!loading &&
                versionGroups.map((group) => (
                  <div key={group.date.toISOString()} className="mb-6">
                    <Text size="sm" fw={600} c="dimmed" mb="md">
                      {formatDate(group.date)}
                    </Text>

                    <Timeline
                      bulletSize={24}
                      lineWidth={2}
                      active={-1}
                      styles={{
                        item: { paddingTop: '0px' },
                      }}
                    >
                      {group.versions.map((version) => {
                        const isSelected = selectedVersion?.id === version.id;
                        return (
                          <Timeline.Item
                            key={version.id}
                            bullet={
                              <div
                                className={`flex items-center justify-center w-6 h-6 rounded-full ${
                                  isSelected
                                    ? 'bg-backgroundAccent-light dark:bg-backgroundAccent-dark text-white'
                                    : 'bg-borderPrimary-light dark:bg-borderPrimary-dark'
                                }`}
                              >
                                <VersionTypeIcon type={version.type} />
                              </div>
                            }
                            className="pb-0.5 last:pb-0"
                            styles={{
                              itemBullet: {
                                backgroundColor: 'transparent',
                                border: 'none',
                                padding: 0,
                              },
                            }}
                          >
                            <div className="relative" style={{ top: '-12px' }}>
                              <Card
                                className={`cursor-pointer transition-all hover:bg-transparentBrandBlue-016 dark:hover:bg-transparentBrandBlue-016 ${
                                  selectedVersion?.id === version.id
                                    ? 'bg-transparentBrandBlue-012 dark:bg-transparentBrandBlue-012 border border-borderAccent-light dark:border-borderAccent-dark'
                                    : 'border border-transparent'
                                }`}
                                withBorder={false}
                                onClick={() => setSelectedVersion(version)}
                                p="xs"
                                data-testid={setDataTestId('version-item')}
                              >
                                <Group justify="space-between" wrap="nowrap">
                                  <div>
                                    <Group gap="xs">
                                      <Text size="sm" fw={500}>
                                        {version.name || formatTime(version.timestamp)}
                                      </Text>
                                      <Text size="xs" c="dimmed">
                                        <VersionTypeLabel type={version.type} />
                                      </Text>
                                    </Group>
                                    {version.description && (
                                      <Text size="xs" c="dimmed" mt={2}>
                                        {version.description}
                                      </Text>
                                    )}
                                    {version.metadata && (
                                      <Text size="xs" c="dimmed">
                                        {version.metadata.linesCount} lines •{' '}
                                        {version.metadata.charactersCount} characters
                                      </Text>
                                    )}
                                  </div>

                                  <Group gap="xs">
                                    <Tooltip label="Name this version">
                                      <ActionIcon
                                        variant="subtle"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRenameVersion(version);
                                        }}
                                      >
                                        <IconEdit size={16} />
                                      </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Restore this version">
                                      <ActionIcon
                                        variant="subtle"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRestoreVersion(version);
                                        }}
                                      >
                                        <IconRestore size={16} />
                                      </ActionIcon>
                                    </Tooltip>
                                  </Group>
                                </Group>
                              </Card>
                            </div>
                          </Timeline.Item>
                        );
                      })}
                    </Timeline>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </div>

        {selectedVersion && (
          <Card className="w-1/2 h-full overflow-hidden flex flex-col" withBorder>
            <Stack h="100%">
              <div>
                <Text size="sm" fw={600}>
                  Version Preview
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDateTime(selectedVersion.timestamp)}
                </Text>
              </div>

              <ScrollArea className="flex-1">
                <pre
                  className="text-xs font-mono whitespace-pre-wrap"
                  data-testid={setDataTestId('version-preview')}
                >
                  {selectedVersion.content}
                </pre>
              </ScrollArea>

              <Group gap="xs" justify="flex-end">
                <Button
                  variant="default"
                  leftSection={<IconCopy size={16} />}
                  onClick={() => handleCopyVersion(selectedVersion)}
                >
                  Copy
                </Button>
                <Button
                  color="background-accent"
                  leftSection={<IconRestore size={16} />}
                  onClick={() => handleRestoreVersion(selectedVersion)}
                >
                  Restore
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
      </div>
    </div>
  );
};
