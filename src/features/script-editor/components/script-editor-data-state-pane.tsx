import { Group, Text, Tooltip, ActionIcon } from '@mantine/core';
import { useDidUpdate, useOs } from '@mantine/hooks';
import { ScriptExecutionState } from '@models/sql-script';
import { IconFileSad, IconSparkles } from '@tabler/icons-react';
import React, { useState, useRef } from 'react';

import { RunQueryButton } from './components';

interface ScriptEditorDataStatePaneProps {
  scriptState: ScriptExecutionState;
  dirty: boolean;

  handleRunQuery: (mode?: 'all' | 'selection') => Promise<void>;
  onAIAssistantClick: () => void;
}

export const ScriptEditorDataStatePane = ({
  scriptState,
  dirty,
  handleRunQuery,
  onAIAssistantClick,
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
        <Tooltip label={`AI Assistant (${isMacOS ? '⌘' : 'Ctrl'}+I)`} position="bottom">
          <ActionIcon c="background-accent" onClick={onAIAssistantClick}>
            <IconSparkles size={24} stroke={1.8} />
          </ActionIcon>
        </Tooltip>
        <RunQueryButton disabled={running} onRunClick={handleRunQuery} />
      </Group>
    </Group>
  );
};
