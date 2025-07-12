import { EditorView } from '@codemirror/view';
import { showSuccess, showError } from '@components/app-notifications';
import { SQLScript } from '@models/sql-script';
import { formatSQLSafe } from '@utils/sql-formatter';

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
    title: 'Failed to format SQL',
    message: formatResult.error,
    autoClose: 3000,
    id: 'sql-format-error',
  });
  return false;
}

/**
 * Format SQL in a CodeMirror editor view
 * @param view The CodeMirror editor view
 * @returns true if formatting was successful, false otherwise
 */
export function formatSQLInEditor(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const hasSelection = !selection.empty;

  let textToFormat: string;
  let fromPos: number;
  let toPos: number;

  if (hasSelection) {
    // Format only selected text
    textToFormat = view.state.sliceDoc(selection.from, selection.to);
    fromPos = selection.from;
    toPos = selection.to;
  } else {
    // Format entire document
    textToFormat = view.state.doc.toString();
    fromPos = 0;
    toPos = view.state.doc.length;
  }

  const formatResult = formatSQLSafe(textToFormat);

  if (formatResult.success) {
    // Replace the text with formatted SQL
    view.dispatch({
      changes: {
        from: fromPos,
        to: toPos,
        insert: formatResult.result,
      },
      // Group this operation for undo/redo
      userEvent: 'format',
    });

    showSuccess({
      title: hasSelection ? 'Selection formatted' : 'SQL formatted successfully',
      message: '',
      autoClose: 2000,
      id: 'sql-format',
    });
    return true;
  }
  showError({
    title: 'Failed to format SQL',
    message: formatResult.error,
    autoClose: 3000,
    id: 'sql-format-error',
  });
  return false;
}
