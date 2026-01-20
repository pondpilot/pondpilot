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
import { IconGitCompare, IconTrash, IconX } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { VersionList } from './version-list';
import { groupVersionsByDate } from '../utils';

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

interface VersionHistorySidebarProps {
  scriptId: SQLScriptId;
  selectedVersion: ScriptVersion | null;
  compareVersion: ScriptVersion | null;
  isCompareMode: boolean;
  onSelectVersion: (version: ScriptVersion | null) => void;
  onSelectCompareVersion: (version: ScriptVersion | null) => void;
  onToggleCompareMode: () => void;
  onRestore: (version: ScriptVersion) => void;
  onClose: () => void;
  renameHandlerRef?: React.MutableRefObject<((version: ScriptVersion) => void) | null>;
}

export const VersionHistorySidebar = ({
  scriptId,
  selectedVersion,
  compareVersion,
  isCompareMode,
  onSelectVersion,
  onSelectCompareVersion,
  onToggleCompareMode,
  onRestore,
  onClose,
  renameHandlerRef,
}: VersionHistorySidebarProps) => {
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const iDbConn = useAppStore((state) => state._iDbConn);

  // Clear all history
  const handleClearHistory = useCallback(() => {
    modals.openConfirmModal({
      title: 'Clear Version History',
      children: (
        <Text size="sm">
          Are you sure you want to delete all version history for this script? This action cannot be
          undone.
        </Text>
      ),
      labels: { confirm: 'Clear All', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (!iDbConn) return;

        try {
          const controller = createScriptVersionController(iDbConn);
          await controller.deleteVersionsForScript(scriptId);
          setVersions([]);
          onSelectVersion(null);
          onSelectCompareVersion(null);
          showAlert({
            title: 'History Cleared',
            message: 'All version history has been deleted',
            autoClose: 3000,
          });
          onClose();
        } catch (error) {
          console.error('Failed to clear history:', error);
          showAlert({
            title: 'Error',
            message: 'Failed to clear version history',
            color: 'red',
          });
        }
      },
    });
  }, [iDbConn, scriptId, onSelectVersion, onSelectCompareVersion, onClose]);

  // Load versions once when sidebar opens
  useEffect(() => {
    let mounted = true;

    const loadVersions = async () => {
      if (!iDbConn) return;

      setLoading(true);
      try {
        const controller = createScriptVersionController(iDbConn);
        const loadedVersions = await controller.getVersionsByScriptId(scriptId);

        if (!mounted) return;

        setVersions(loadedVersions);

        // Auto-select first version if none selected
        if (loadedVersions.length > 0) {
          onSelectVersion(loadedVersions[0]);
        }
      } catch (error) {
        console.error('Failed to load versions:', error);
        showAlert({
          title: 'Failed to load version history',
          message: 'Unable to retrieve version history. Please try again.',
          color: 'red',
          autoClose: 5000,
        });
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadVersions();

    return () => {
      mounted = false;
    };
  }, [scriptId, iDbConn, onSelectVersion]);

  const handleSelectVersion = useCallback(
    (version: ScriptVersion) => {
      if (!isCompareMode) {
        onSelectVersion(version);
        return;
      }

      // Compare mode logic
      if (!selectedVersion) {
        onSelectVersion(version);
        return;
      }

      if (selectedVersion.id === version.id) {
        // Deselect if clicking the same version
        onSelectVersion(compareVersion);
        onSelectCompareVersion(null);
        return;
      }

      if (compareVersion?.id === version.id) {
        // Deselect compare version
        onSelectCompareVersion(null);
        return;
      }

      // Set as compare version
      onSelectCompareVersion(version);
    },
    [isCompareMode, selectedVersion, compareVersion, onSelectVersion, onSelectCompareVersion],
  );

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

                // Reload versions
                const updatedVersions = await controller.getVersionsByScriptId(scriptId);
                setVersions(updatedVersions);

                // Update selection if needed
                if (selectedVersion?.id === version.id) {
                  const updated = updatedVersions.find((v) => v.id === version.id);
                  if (updated) onSelectVersion(updated);
                }
                if (compareVersion?.id === version.id) {
                  const updated = updatedVersions.find((v) => v.id === version.id);
                  if (updated) onSelectCompareVersion(updated);
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
    },
    [iDbConn, scriptId, selectedVersion, compareVersion, onSelectVersion, onSelectCompareVersion],
  );

  // Expose rename handler to parent via ref.
  // This allows the top bar (ScriptEditorDataStatePane) to trigger the rename modal
  // which is implemented here in the sidebar. The parent passes a ref that we populate
  // with our handler, enabling sibling component communication.
  useEffect(() => {
    if (renameHandlerRef) {
      renameHandlerRef.current = handleRenameVersion;
    }
    return () => {
      if (renameHandlerRef) {
        renameHandlerRef.current = null;
      }
    };
  }, [renameHandlerRef, handleRenameVersion]);

  const isVersionSelected = useCallback(
    (version: ScriptVersion) => selectedVersion?.id === version.id,
    [selectedVersion],
  );

  const isVersionCompareTarget = useCallback(
    (version: ScriptVersion) => compareVersion?.id === version.id,
    [compareVersion],
  );

  const versionGroups = useMemo(() => groupVersionsByDate(versions), [versions]);
  const currentVersionId = versions.length > 0 ? versions[0].id : null;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (versions.length === 0) return;

      const currentIndex = selectedVersion
        ? versions.findIndex((v) => v.id === selectedVersion.id)
        : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < versions.length - 1 ? currentIndex + 1 : currentIndex;
        handleSelectVersion(versions[nextIndex]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        handleSelectVersion(versions[prevIndex]);
      } else if (e.key === 'Enter' && selectedVersion) {
        e.preventDefault();
        onRestore(selectedVersion);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [versions, selectedVersion, handleSelectVersion, onRestore]);

  return (
    <div
      className="w-[280px] flex-shrink-0 h-full flex flex-col border-l border-borderPrimary-light dark:border-borderPrimary-dark bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark animate-slide-in-right"
      data-testid={setDataTestId('version-history-sidebar')}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-borderPrimary-light dark:border-borderPrimary-dark flex items-center justify-between">
        <Text size="sm" fw={600} className="text-textPrimary-light dark:text-textPrimary-dark">
          Version History
        </Text>
        <div className="flex items-center gap-1">
          <Tooltip label={isCompareMode ? 'Exit compare mode' : 'Compare versions'}>
            <ActionIcon
              variant={isCompareMode ? 'primary' : 'transparent'}
              size="sm"
              onClick={onToggleCompareMode}
              data-testid={setDataTestId('compare-mode-button')}
            >
              <IconGitCompare size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Clear all history">
            <ActionIcon
              size="sm"
              c="icon-error"
              onClick={handleClearHistory}
              disabled={versions.length === 0}
              data-testid={setDataTestId('clear-history-button')}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            size="sm"
            onClick={onClose}
            data-testid={setDataTestId('version-history-close-button')}
          >
            <IconX size={16} />
          </ActionIcon>
        </div>
      </div>

      {/* Compare mode hint */}
      {isCompareMode && (
        <div className="px-4 py-2 bg-transparentBrandBlue_palette-008-light dark:bg-transparentBrandBlue_palette-008-dark">
          <Text size="xs" c="text-secondary">
            Select two versions to compare
          </Text>
        </div>
      )}

      {/* Version list */}
      <div className="flex-1 overflow-hidden relative px-3">
        <LoadingOverlay visible={loading} />
        {!loading && (
          <VersionList
            versionGroups={versionGroups}
            selectionMode={isCompareMode ? 'compare' : 'preview'}
            isVersionSelected={isVersionSelected}
            isVersionCompareTarget={isVersionCompareTarget}
            currentVersionId={currentVersionId}
            onSelectVersion={handleSelectVersion}
          />
        )}
      </div>
    </div>
  );
};
