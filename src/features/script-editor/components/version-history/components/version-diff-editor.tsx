import { useEditorTheme } from '@features/editor/hooks';
import { useAppTheme } from '@hooks/use-app-theme';
import { Text } from '@mantine/core';
import { ScriptVersion } from '@models/script-version';
import { DiffEditor } from '@monaco-editor/react';
import { setDataTestId } from '@utils/test-id';
import * as monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';

const EDITOR_OPTIONS: monaco.editor.IDiffEditorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  fontSize: 13,
  fontFamily: "'IBM Plex Mono', monospace",
  renderSideBySide: true,
  originalEditable: false,
  renderOverviewRuler: false,
};

interface VersionDiffEditorProps {
  currentContent: string;
  selectedVersion: ScriptVersion | null;
  compareVersion: ScriptVersion | null;
}

export const VersionDiffEditor = ({
  currentContent,
  selectedVersion,
  compareVersion,
}: VersionDiffEditorProps) => {
  const colorScheme = useAppTheme();
  const colorSchemeDark = colorScheme === 'dark';
  const { themeName, themeData } = useEditorTheme(colorSchemeDark);
  const themeDefinedRef = useRef(false);

  // Define theme for DiffEditor
  useEffect(() => {
    if (!themeDefinedRef.current && typeof window !== 'undefined') {
      import('monaco-editor').then((monacoModule) => {
        monacoModule.editor.defineTheme(themeName, themeData as monaco.editor.IStandaloneThemeData);
        themeDefinedRef.current = true;
      });
    }
  }, [themeName, themeData]);

  // Empty state - no version selected
  if (!selectedVersion) {
    return (
      <div
        className="h-full flex items-center justify-center bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark"
        data-testid={setDataTestId('version-diff-empty')}
      >
        <Text className="text-textSecondary-light dark:text-textSecondary-dark">
          Select a version to view changes
        </Text>
      </div>
    );
  }

  // Compare mode - two versions selected
  if (compareVersion) {
    // Determine which version is older/newer for proper diff display
    const [olderVersion, newerVersion] =
      selectedVersion.timestamp < compareVersion.timestamp
        ? [selectedVersion, compareVersion]
        : [compareVersion, selectedVersion];

    return (
      <div className="h-full" data-testid={setDataTestId('version-diff-compare')}>
        <DiffEditor
          original={olderVersion.content}
          modified={newerVersion.content}
          language="sql"
          theme={themeName}
          options={EDITOR_OPTIONS}
        />
      </div>
    );
  }

  // Single version mode - show diff against current content
  return (
    <div className="h-full" data-testid={setDataTestId('version-diff-single')}>
      <DiffEditor
        original={selectedVersion.content}
        modified={currentContent}
        language="sql"
        theme={themeName}
        options={EDITOR_OPTIONS}
      />
    </div>
  );
};
