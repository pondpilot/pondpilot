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
