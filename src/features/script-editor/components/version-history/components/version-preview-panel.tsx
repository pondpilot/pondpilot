import { useEditorTheme } from '@features/editor/hooks';
import { useAppTheme } from '@hooks/use-app-theme';
import { Button, Group, Text } from '@mantine/core';
import { ScriptVersion } from '@models/script-version';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import { IconCopy, IconRestore } from '@tabler/icons-react';
import { formatDateTime } from '@utils/date-formatters';
import { setDataTestId } from '@utils/test-id';
import * as monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';

const EDITOR_BASE_OPTIONS: monaco.editor.IEditorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  fontSize: 13,
  fontFamily: "'IBM Plex Mono', monospace",
};

interface VersionPreviewPanelProps {
  selectedVersion: ScriptVersion | null;
  compareVersion: ScriptVersion | null;
  currentContent: string;
  compareMode: boolean;
  onRestore: (version: ScriptVersion) => void;
  onCopy: (version: ScriptVersion) => void;
}

export const VersionPreviewPanel = ({
  selectedVersion,
  compareVersion,
  currentContent,
  compareMode,
  onRestore,
  onCopy,
}: VersionPreviewPanelProps) => {
  const colorScheme = useAppTheme();
  const colorSchemeDark = colorScheme === 'dark';
  const { themeName, themeData } = useEditorTheme(colorSchemeDark);
  const themeDefinedRef = useRef(false);

  // Define theme for DiffEditor
  useEffect(() => {
    if (!themeDefinedRef.current && typeof window !== 'undefined') {
      // Monaco is loaded globally, define the theme once
      import('monaco-editor').then((monacoModule) => {
        monacoModule.editor.defineTheme(themeName, themeData as monaco.editor.IStandaloneThemeData);
        themeDefinedRef.current = true;
      });
    }
  }, [themeName, themeData]);

  // Empty state
  if (!selectedVersion) {
    const message = compareMode ? 'Select two versions to compare' : 'Select a version to preview';

    return (
      <div className="h-full flex items-center justify-center border border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg">
        <Text className="text-textSecondary-light dark:text-textSecondary-dark">{message}</Text>
      </div>
    );
  }

  // Compare mode with two versions selected
  if (compareMode && compareVersion) {
    // Determine which version is older/newer for proper diff display
    const [olderVersion, newerVersion] =
      selectedVersion.timestamp < compareVersion.timestamp
        ? [selectedVersion, compareVersion]
        : [compareVersion, selectedVersion];

    return (
      <div className="h-full flex flex-col border border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-borderPrimary-light dark:border-borderPrimary-dark bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark">
          <Group justify="space-between" align="center">
            <div>
              <Text
                size="sm"
                fw={600}
                className="text-textPrimary-light dark:text-textPrimary-dark"
              >
                Comparing Versions
              </Text>
              <Text size="xs" className="text-textSecondary-light dark:text-textSecondary-dark">
                {olderVersion.name || formatDateTime(olderVersion.timestamp)} →{' '}
                {newerVersion.name || formatDateTime(newerVersion.timestamp)}
              </Text>
            </div>
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRestore size={14} />}
              onClick={() => onRestore(newerVersion)}
            >
              Restore Newer
            </Button>
          </Group>
        </div>

        <div className="flex-1 min-h-0">
          <DiffEditor
            original={olderVersion.content}
            modified={newerVersion.content}
            language="sql"
            theme={themeName}
            options={{
              ...EDITOR_BASE_OPTIONS,
              renderSideBySide: true,
            }}
          />
        </div>
      </div>
    );
  }

  // Single version preview mode - show diff against current content
  const hasChanges = selectedVersion.content !== currentContent;

  return (
    <div className="h-full flex flex-col border border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-borderPrimary-light dark:border-borderPrimary-dark bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark">
        <Text size="sm" fw={600} className="text-textPrimary-light dark:text-textPrimary-dark">
          {selectedVersion.name || formatDateTime(selectedVersion.timestamp)}
        </Text>
        <Text size="xs" className="text-textSecondary-light dark:text-textSecondary-dark">
          {hasChanges ? 'Changes from current version' : 'No changes from current version'}
        </Text>
      </div>

      <div className="flex-1 min-h-0" data-testid={setDataTestId('version-preview')}>
        {hasChanges ? (
          <DiffEditor
            original={selectedVersion.content}
            modified={currentContent}
            language="sql"
            theme={themeName}
            options={{
              ...EDITOR_BASE_OPTIONS,
              renderSideBySide: true,
            }}
          />
        ) : (
          <MonacoEditor
            value={selectedVersion.content}
            language="sql"
            theme={themeName}
            options={{
              ...EDITOR_BASE_OPTIONS,
              lineNumbers: 'off',
              folding: false,
              glyphMargin: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 0,
              renderLineHighlight: 'none',
            }}
          />
        )}
      </div>

      <div className="px-4 py-3 border-t border-borderPrimary-light dark:border-borderPrimary-dark bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark">
        <Group gap="xs" justify="flex-end">
          <Button
            variant="default"
            size="xs"
            leftSection={<IconCopy size={14} />}
            onClick={() => onCopy(selectedVersion)}
          >
            Copy
          </Button>
          <Button
            color="background-accent"
            size="xs"
            leftSection={<IconRestore size={14} />}
            onClick={() => onRestore(selectedVersion)}
          >
            Restore
          </Button>
        </Group>
      </div>
    </div>
  );
};
