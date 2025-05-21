import { SQLNamespace } from '@codemirror/lang-sql';
import { Editor, OnMount } from '@monaco-editor/react';
import { editor, IDisposable, KeyCode, KeyMod } from 'monaco-editor';
import {
  forwardRef,
  KeyboardEventHandler,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

interface SqlEditorProps {
  colorSchemeDark: boolean;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  schema?: SQLNamespace;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onCursorChange?: (pos: number, lineNumber: number, columnNumber: number) => void;
  duckDBFunctions: Array<{
    function_name: string;
    description: string;
    parameters: string;
    return_type: string;
    function_type: string;
    schema_name: string;
  }>;
  onBlur: () => void;

  onRunSelection: () => void;
  onRunFullQuery: () => void;
}

export const SqlEditor = forwardRef<any, SqlEditorProps>(
  (
    {
      colorSchemeDark,
      value,
      onChange,
      schema,
      readOnly,
      onRunFullQuery,
      onRunSelection,
      onBlur,
      duckDBFunctions,
    }: SqlEditorProps,
    ref,
  ) => {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
    const [isReady, setIsReady] = useState(false);

    const handleEditorDidMount: OnMount = (editorInstance, monacoInstance) => {
      editorRef.current = editorInstance;
      monacoRef.current = monacoInstance;
      setIsReady(true);
      // Add onBlur support using Monaco's event API
      if (editorInstance) {
        editorInstance.onDidBlurEditorWidget(() => {
          onBlur();
        });
      }
    };

    useImperativeHandle(ref, () => {
      return {
        getEditor() {
          return editorRef.current;
        },
        getSelection() {
          const editorRefCurr = editorRef.current;
          if (!editorRefCurr) return null;

          const selection = editorRefCurr.getSelection();
          if (selection) {
            return editorRefCurr.getModel()?.getValueInRange(selection);
          }
        },
        getValues() {
          const editorRefCurr = editorRef.current;
          if (!editorRefCurr) return null;

          return editorRefCurr.getModel()?.getValue();
        },
      };
    }, []);

    useEffect(() => {
      if (monacoRef.current) {
        monacoRef.current.editor.setTheme(colorSchemeDark ? 'vs-dark' : 'vs-light');
      }
    }, [colorSchemeDark]);

    useEffect(() => {
      const disposables: IDisposable[] = [];

      if (!editorRef.current) return;
      if (!isReady) return;

      disposables.push(
        editorRef.current.addAction({
          id: 'run-all',
          label: 'Run All',
          keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
          contextMenuGroupId: 'navigation',
          contextMenuOrder: 1.5,
          run: onRunFullQuery,
        }),
      );

      disposables.push(
        editorRef.current.addAction({
          id: 'run-selection',
          label: 'Run Selection',
          keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter],
          contextMenuGroupId: 'navigation',
          contextMenuOrder: 1.6,
          run: onRunSelection,
        }),
      );

      return () => {
        disposables.forEach((disposable) => disposable.dispose());
      };
    }, [isReady, onRunFullQuery, onRunSelection]);

    useEffect(() => {
      if (!monacoRef.current || !isReady || !duckDBFunctions?.length) return;

      const monaco = monacoRef.current;
      // Register completion provider for SQL
      const disposable = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '(', ','],
        provideCompletionItems: (model, position, _context, _token) => {
          // Get the word at the current position
          const wordInfo = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: wordInfo.startColumn,
            endColumn: wordInfo.endColumn,
          };
          // Optionally, add context-aware filtering here
          // For now, show all functions
          const suggestions = duckDBFunctions.map((fn) => {
            const label = fn.function_name;
            const params = fn.parameters ? fn.parameters : '';
            const insertText = `${label}(${
              params
                ? params
                    .split(',')
                    .map((p) => p.split('=')[0].trim())
                    .join(', ')
                : ''
            })`;
            return {
              label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: fn.return_type
                ? `${label}(${params}) → ${fn.return_type}`
                : `${label}(${params})`,
              documentation: fn.description || '',
              range,
            };
          });
          return { suggestions };
        },
      });

      return () => {
        disposable.dispose();
      };
    }, [isReady, duckDBFunctions]);

    return (
      <Editor
        language="sql"
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          folding: false,
          readOnly,
        }}
        value={value}
        onChange={(v) => onChange?.(v || '')}
        onMount={handleEditorDidMount}
      />
    );
  },
);
