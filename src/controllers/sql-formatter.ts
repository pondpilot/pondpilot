import { showSuccess, showError } from '@components/app-notifications';
import { SQLScript } from '@models/sql-script';
import { formatSQLSafe } from '@utils/sql-formatter';
import type * as monaco from 'monaco-editor';

import { updateSQLScriptContent } from './sql-script';

/**
 * Format and apply SQL to a script object
 * @param sqlScript The SQL script to format
 * @returns true if formatting was successful, false otherwise
 */
export async function formatAndApplySQLScript(sqlScript: SQLScript): Promise<boolean> {
  const formatResult = formatSQLSafe(sqlScript.content);

  if (formatResult.success) {
    // Only update if the content has changed
    if (sqlScript.content !== formatResult.result) {
      await updateSQLScriptContent(sqlScript, formatResult.result);
    }
    showSuccess({
      title: 'SQL formatted successfully',
      message: '',
      autoClose: 2000,
      id: 'sql-format',
    });
    return true;
  }
  showError({
    title: 'SQL formatting failed',
    message: formatResult.error,
    autoClose: 3000,
    id: 'sql-format-error',
  });
  return false;
}

/**
 * Format SQL in a Monaco editor
 * @param editor The Monaco editor instance
 * @returns true if formatting was successful, false otherwise
 */
export function formatSQLInEditor(editor: monaco.editor.IStandaloneCodeEditor): boolean {
  const model = editor.getModel();
  if (!model) return false;

  const selection = editor.getSelection();
  const hasSelection = selection ? !selection.isEmpty() : false;

  let textToFormat: string;
  let range: monaco.IRange;

  if (selection && hasSelection) {
    textToFormat = model.getValueInRange(selection);
    range = selection;
  } else {
    textToFormat = model.getValue();
    range = model.getFullModelRange();
  }

  const formatResult = formatSQLSafe(textToFormat);

  if (formatResult.success) {
    const startOffset = model.getOffsetAt({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });

    editor.executeEdits('sql-format', [
      {
        range,
        text: formatResult.result,
        forceMoveMarkers: true,
      },
    ]);

    // Restore selection to cover the formatted text
    if (hasSelection) {
      const endOffset = startOffset + formatResult.result.length;
      const startPos = model.getPositionAt(startOffset);
      const endPos = model.getPositionAt(endOffset);
      editor.setSelection({
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      });
    }

    showSuccess({
      title: hasSelection ? 'Selection formatted' : 'SQL formatted successfully',
      message: '',
      autoClose: 2000,
      id: 'sql-format',
    });
    return true;
  }
  showError({
    title: 'SQL formatting failed',
    message: formatResult.error,
    autoClose: 3000,
    id: 'sql-format-error',
  });
  return false;
}
