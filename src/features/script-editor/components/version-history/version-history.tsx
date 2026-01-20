import { showAlert } from '@components/app-notifications';
import { LoadingOverlay } from '@components/loading-overlay';
import { createScriptVersionController } from '@controllers/script-version';
import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { ScriptVersion } from '@models/script-version';
import { SQLScriptId } from '@models/sql-script';
import { useAppStore } from '@store/app-store';
import { IconGitCompare, IconX } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { VersionList, VersionPreviewPanel } from './components';
import { useVersionSelection } from './hooks';
import { groupVersionsByDate } from './utils';

interface VersionHistoryProps {
  scriptId: SQLScriptId;
  currentContent: string;
  onRestore: (version: ScriptVersion) => void;
  onClose: () => void;
}

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

export const VersionHistory = ({
  scriptId,
  currentContent,
  onRestore,
  onClose,
}: VersionHistoryProps) => {
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const iDbConn = useAppStore((state) => state._iDbConn);

  const {
    state: selectionState,
    selectVersion,
    toggleCompareMode,
    isVersionSelected,
    isVersionCompareTarget,
    syncWithVersions,
  } = useVersionSelection();

  const handleRestoreVersion = useCallback(
    (version: ScriptVersion) => {
      modals.openConfirmModal({
        title: 'Restore Version',
        children: (
          <Text size="sm">
            Are you sure you want to restore this version? This will replace your current script
            content.
          </Text>
        ),
        labels: { confirm: 'Restore', cancel: 'Cancel' },
        confirmProps: { color: 'background-accent' },
        onConfirm: () => onRestore(version),
      });
    },
    [onRestore],
  );

  const handleCopyVersion = useCallback(async (version: ScriptVersion) => {
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
  }, []);

  const handleRenameVersion = useCallback(
    (version: ScriptVersion) => {
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

                // Reload versions and sync selection state
                const updatedVersions = await controller.getVersionsByScriptId(scriptId);
                setVersions(updatedVersions);
                syncWithVersions(updatedVersions);

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
    },
    [iDbConn, scriptId, syncWithVersions],
  );

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

  useEffect(() => {
    if (!selectionState.selectedVersion && versions.length > 0) {
      selectVersion(versions[0]);
    }
  }, [versions, selectionState.selectedVersion, selectVersion]);

  const versionGroups = useMemo(() => groupVersionsByDate(versions), [versions]);
  const hasSelection = selectionState.selectedVersion !== null;
  const isCompareMode = selectionState.mode === 'compare';
  const currentVersionId = versions.length > 0 ? versions[0].id : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-borderPrimary-light dark:border-borderPrimary-dark bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark z-10">
        <Group justify="space-between">
          <Text size="lg" fw={600} className="text-textPrimary-light dark:text-textPrimary-dark">
            Version History
          </Text>
          <Group gap="xs">
            <Tooltip label={isCompareMode ? 'Exit compare mode' : 'Compare versions'}>
              <ActionIcon
                variant={isCompareMode ? 'filled' : 'subtle'}
                color={isCompareMode ? 'background-accent' : undefined}
                onClick={toggleCompareMode}
              >
                <IconGitCompare size={18} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              onClick={onClose}
              data-testid={setDataTestId('version-history-close-button')}
            >
              <IconX size={18} />
            </ActionIcon>
          </Group>
        </Group>
        {isCompareMode && (
          <Text size="xs" className="text-textSecondary-light dark:text-textSecondary-dark mt-1">
            Select two versions to compare changes
          </Text>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-4 overflow-hidden px-6 py-4">
        {/* Version list */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            hasSelection ? 'w-2/5' : 'flex-1',
          )}
        >
          <LoadingOverlay visible={loading} />
          {!loading && (
            <VersionList
              versionGroups={versionGroups}
              selectionMode={selectionState.mode}
              isVersionSelected={isVersionSelected}
              isVersionCompareTarget={isVersionCompareTarget}
              currentVersionId={currentVersionId}
              onSelectVersion={selectVersion}
              onRenameVersion={handleRenameVersion}
              onRestoreVersion={handleRestoreVersion}
              onCopyVersion={handleCopyVersion}
            />
          )}
        </div>

        {/* Preview/Diff panel */}
        {hasSelection && (
          <div className="w-3/5 overflow-hidden">
            <VersionPreviewPanel
              selectedVersion={selectionState.selectedVersion}
              compareVersion={selectionState.compareVersion}
              currentContent={currentContent}
              compareMode={isCompareMode}
              onRestore={handleRestoreVersion}
              onCopy={handleCopyVersion}
            />
          </div>
        )}
      </div>
    </div>
  );
};
