import { pickedCompletion, type Completion } from '@codemirror/autocomplete';
import { DataBaseModel, DBColumn, DBSchema, DBTableOrView } from '@models/db';
import { checkValidDuckDBIdentifer } from '@utils/duckdb/identifier';
import { EditorView } from 'codemirror';

const applyCompletionWithQuotes =
  (name: string) => (view: EditorView, completion: Completion, from: number, to: number) => {
    const quotedId = `"${name}"`;
    view.dispatch({
      changes: { from, to, insert: quotedId },
      selection: { anchor: from + quotedId.length, head: from + quotedId.length },
      annotations: pickedCompletion.of(completion),
    });
  };

/**
 * Create a completion item for a database object helpers
 */

export const createColumnCompletion = (column: DBColumn, boost?: number): Completion => ({
  label: column.name,
  detail: column.sqlType,
  type: 'column',
  apply: checkValidDuckDBIdentifer(column.name)
    ? undefined
    : applyCompletionWithQuotes(column.name),
  boost: boost || 1,
});

export const createTableOrViewCompletion = (
  tableOrView: DBTableOrView,
  boost?: number,
): Completion => ({
  label: tableOrView.name,
  displayLabel: tableOrView.label,
  type: tableOrView.type,
  apply: checkValidDuckDBIdentifer(tableOrView.name)
    ? undefined
    : applyCompletionWithQuotes(tableOrView.name),
  boost: boost || 1,
});

export const createSchemaCompletion = (
  schema: DBSchema,
  dbName?: string,
  boost?: number,
): Completion => ({
  label: schema.name,
  displayLabel: dbName ? `${dbName}.${schema.name}` : schema.name,
  type: 'schema',
  apply: checkValidDuckDBIdentifer(schema.name)
    ? undefined
    : applyCompletionWithQuotes(schema.name),
  boost: boost || 1,
});

export const createDatabaseCompletion = (db: DataBaseModel, boost?: number): Completion => ({
  label: db.name,
  type: 'database',
  apply: checkValidDuckDBIdentifer(db.name) ? undefined : applyCompletionWithQuotes(db.name),
  boost: boost || 1,
});

export const createFunctionCompletion = (funcName: string, boost?: number): Completion => ({
  label: funcName,
  type: 'function',
  boost: boost || 1,
});
