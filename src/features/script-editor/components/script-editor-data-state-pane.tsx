import { showAlert } from '@components/app-notifications';
import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { useDidUpdate, useOs } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { ScriptVersion } from '@models/script-version';
import { ScriptExecutionState } from '@models/sql-script';
import {
  IconArrowLeft,
  IconCopy,
  IconFileSad,
  IconHistory,
  IconPencil,
  IconRestore,
  IconSparkles,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useRef, useState } from 'react';

import { RunQueryButton } from './components';

interface ScriptEditorDataStatePaneProps {
  scriptState: ScriptExecutionState;
  dirty: boolean;
  historyMode?: boolean;
  selectedVersion?: ScriptVersion | null;

  handleRunQuery: (mode?: 'all' | 'selection') => Promise<void>;
  onAIAssistantClick: () => void;
  onEnterHistoryMode?: () => void;
  onExitHistoryMode?: () => void;
  onRestoreVersion?: (version: ScriptVersion) => void;
  onRenameVersion?: (version: ScriptVersion) => void;
}

export const ScriptEditorDataStatePane = ({
  scriptState,
  dirty,
  historyMode = false,
  selectedVersion,
  handleRunQuery,
  onAIAssistantClick,
  onEnterHistoryMode,
  onExitHistoryMode,
  onRestoreVersion,
  onRenameVersion,
}: ScriptEditorDataStatePaneProps) => {
  const os = useOs();
  const isMacOS = os === 'macos';
  const running = scriptState === 'running';
  const error = scriptState === 'error';
  const executedSuccess = scriptState === 'success';

  const [scriptExecutionTimeInSec, setScriptExecutionTimeInSec] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useDidUpdate(() => {
    // Clear any existing timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (running) {
      setScriptExecutionTimeInSec(0);
      timerRef.current = setInterval(() => {
        setScriptExecutionTimeInSec((prev) => Number((prev + 0.1).toFixed(1)));
      }, 100);
    }
    // The cleanup function will handle unmounting
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  const handleCopyVersion = async () => {
    if (!selectedVersion) return;

    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      showAlert({
        title: 'Failed to copy',
        message: 'Clipboard API not available',
        color: 'red',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedVersion.content);
      showAlert({
        title: 'Copied to clipboard',
        message: 'Version content copied successfully',
        autoClose: 2000,
      });
    } catch (err) {
      console.error('Failed to copy:', err);
      showAlert({
        title: 'Failed to copy',
        message: 'Could not copy to clipboard',
        color: 'red',
      });
    }
  };

  const handleRestoreVersion = () => {
    if (!selectedVersion) return;

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
      onConfirm: () => onRestoreVersion?.(selectedVersion),
    });
  };

  // History mode controls
  if (historyMode) {
    return (
      <Group className="px-3 h-10" justify="space-between">
        <Group gap={8}>
          <Button
            variant="transparent"
            size="xs"
            leftSection={<IconArrowLeft size={16} />}
            onClick={onExitHistoryMode}
            data-testid={setDataTestId('exit-history-button')}
          >
            Exit History
          </Button>
        </Group>
        <Group gap={8}>
          {selectedVersion && (
            <>
              <Tooltip label="Copy version content">
                <ActionIcon size="sm" aria-label="Copy version content" onClick={handleCopyVersion}>
                  <IconCopy size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Rename version">
                <ActionIcon
                  size="sm"
                  aria-label="Rename version"
                  onClick={() => onRenameVersion?.(selectedVersion)}
                  data-testid={setDataTestId('rename-version-button')}
                >
                  <IconPencil size={18} />
                </ActionIcon>
              </Tooltip>
              <Button
                variant="default"
                size="xs"
                leftSection={<IconRestore size={16} />}
                onClick={handleRestoreVersion}
                data-testid={setDataTestId('restore-version-button')}
              >
                Restore
              </Button>
            </>
          )}
        </Group>
      </Group>
    );
  }

  // Normal mode controls
  return (
    <Group className="px-3 h-10" justify="space-between">
      <Group gap={2}>
        {dirty && !error && (
          <Group gap={4}>
            <IconFileSad size={18} className="text-textWarning-light dark:text-textWarning-dark" />
            <Text c="text-warning" className="text-sm font-medium">
              Since the last run, the script has changed
            </Text>
          </Group>
        )}
        {error && (
          <Text c="text-error" className="text-sm font-medium">
            Error running query
          </Text>
        )}
        {running && (
          <Group gap={4}>
            <Text c="text-secondary" className="text-sm font-medium">
              Processing Query...
            </Text>
            <Text c="text-secondary" className="text-sm font-medium">
              {scriptExecutionTimeInSec} sec
            </Text>
          </Group>
        )}
        {!dirty && executedSuccess && !running && (
          <Text c="text-success" className="text-sm font-medium">
            Query ran successfully
          </Text>
        )}
      </Group>
      <Group gap={8}>
        <Group gap={2}>
          {onEnterHistoryMode && (
            <Tooltip label="Version History">
              <ActionIcon
                variant="subtle"
                c="background-accent"
                aria-label="Version History"
                onClick={onEnterHistoryMode}
                data-testid={setDataTestId('version-history-button')}
              >
                <IconHistory size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={`AI Assistant (${isMacOS ? '⌘' : 'Ctrl'}+I)`} position="bottom">
            <ActionIcon
              c="background-accent"
              aria-label="AI Assistant"
              onClick={onAIAssistantClick}
            >
              <IconSparkles size={24} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <RunQueryButton disabled={running} onRunClick={handleRunQuery} />
      </Group>
    </Group>
  );
};
