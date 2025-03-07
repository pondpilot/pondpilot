/* eslint-disable no-continue */

import { EditorState } from '@uiw/react-codemirror';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { syntaxTree } from '@codemirror/language';
import { tableFromIPC } from 'apache-arrow';
import { createName } from '@utils/helpers';
import { DataBaseModel } from '@models/common';
import { splitSqlQuery } from '../../utils/editor/statement-parser';
import { DBRunQueryProps, DBWorkerAPIType, RunQueryResponse, SessionFiles } from './models';
import { SessionWorker } from './app-session-worker';

export const transformDatabaseStructure = (
  input: {
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: { name: string; type: string; nullable: boolean }[];
  }[],
): DataBaseModel[] => {
  const dbMap = new Map<string, DataBaseModel>();

  input.forEach((item) => {
    if (!dbMap.has(item.database_name)) {
      dbMap.set(item.database_name, {
        name: item.database_name,
        schemas: [],
      });
    }

    const db = dbMap.get(item.database_name)!;
    let schema = db.schemas.find((s) => s.name === item.schema_name);

    if (!schema) {
      schema = {
        name: item.schema_name,
        tables: [],
      };
      db.schemas.push(schema);
    }

    schema.tables.push({ name: item.table_name, columns: item.columns });
  });

  return Array.from(dbMap.values());
};

export const updateDatabasesWithColumns = async (
  dbProxyRef: DBWorkerAPIType,
  databases: string[],
): Promise<DataBaseModel[]> => {
  const duckdbColumns = await dbProxyRef.getTablesAndColumns();
  const allColumns = tableFromIPC(duckdbColumns)
    .toArray()
    .map((row) => row.toJSON())
    .filter((col) => databases.includes(col.database_name) || col.database_name === 'memory');

  const tablesWithColumns = allColumns.reduce((acc: any[], col) => {
    const existingTable = acc.find(
      (t) =>
        t.database_name === col.database_name &&
        t.schema_name === col.schema_name &&
        t.table_name === col.table_name,
    );

    if (existingTable) {
      existingTable.columns.push({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable,
      });
    } else {
      acc.push({
        database_name: col.database_name,
        schema_name: col.schema_name,
        table_name: col.table_name,
        columns: [
          {
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable,
          },
        ],
      });
    }
    return acc;
  }, []);

  return transformDatabaseStructure(tablesWithColumns);
};

interface QueryStatement {
  text: string;
  isSelect: boolean;
  isUse: boolean;
  isDrop: boolean;
}

interface ExecuteQueriesProps {
  runQueryProps: DBRunQueryProps;
  dbProxyRef: React.RefObject<any>;
  isCancelledPromise: Promise<never>;
  currentSources: SessionFiles | null;
}

interface QueryResult {
  queryResults: RunQueryResponse | undefined;
  originalQuery: string;
}

export const executeQueries = async ({
  runQueryProps,
  dbProxyRef,
  isCancelledPromise,
  currentSources,
}: ExecuteQueriesProps): Promise<QueryResult> => {
  const statements = parseStatements(runQueryProps.query);

  await validateStatements(statements, currentSources);

  for (const [index, statement] of statements.entries()) {
    const queryToExecute = buildQuery(statement, runQueryProps);
    const isLastQuery = index === statements.length - 1;

    const result = await executeStatement({
      query: queryToExecute,
      dbProxyRef,
      isCancelledPromise,
      statement,
      hasLimit: statement.isSelect,
    });

    if (isLastQuery) {
      return {
        queryResults: result,
        originalQuery: statement.isSelect ? statement.text.replaceAll(';', '') : '',
      };
    }
  }

  return { queryResults: undefined, originalQuery: '' };
};

const parseStatements = (query: string): QueryStatement[] => {
  const state = EditorState.create({
    doc: query,
    extensions: [sql({ dialect: PostgreSQL })],
  });

  return splitSqlQuery(state).map((q) => ({
    text: q.text,
    isSelect: q.text.toLowerCase().startsWith('select'),
    isUse: q.text.toLowerCase().startsWith('use'),
    isDrop: q.text.toLowerCase().startsWith('drop'),
  }));
};

const validateStatements = async (
  statements: QueryStatement[],
  currentSources: SessionFiles | null,
): Promise<void> => {
  if (!statements.length) {
    throw new Error('No valid SQL statements found');
  }

  const useStatements = statements.filter((s) => s.isUse);
  if (useStatements.length > 0) {
    throw new Error('USE statements are not supported');
  }

  if (!currentSources?.sources.length) return;

  // Check all DROP statements against source tables
  const dropStatements = statements.filter((s) => s.isDrop);
  for (const statement of dropStatements) {
    const state = EditorState.create({
      doc: statement.text,
      extensions: [sql({ dialect: PostgreSQL })],
    });

    const tree = syntaxTree(state);
    const cursor = tree.cursor();
    let tableName = '';

    while (cursor.next()) {
      if (cursor.name === 'Identifier') {
        tableName = state.sliceDoc(cursor.from, cursor.to);
        break;
      }
    }

    const isSourceTable = currentSources.sources.some(
      (source) => source.name.toLowerCase() === tableName.toLowerCase(),
    );

    if (isSourceTable) {
      throw new Error(`Cannot drop table "${tableName}" as it is a source file`);
    }
  }
};
const buildQuery = (statement: QueryStatement, runQueryProps: DBRunQueryProps): string => {
  const clearedQuery = statement.text.replaceAll(';', '');

  if (runQueryProps.queryWithoutLimit) {
    return statement.text;
  }

  return statement.isSelect
    ? `select * from (${clearedQuery}) LIMIT ${runQueryProps.limit} OFFSET ${runQueryProps.offset}`
    : statement.text;
};

const executeStatement = async ({
  query,
  dbProxyRef,
  isCancelledPromise,
  statement,
  hasLimit,
}: {
  query: string;
  dbProxyRef: React.RefObject<any>;
  isCancelledPromise: Promise<never>;
  statement: QueryStatement;
  hasLimit: boolean;
}): Promise<RunQueryResponse> =>
  Promise.race([
    dbProxyRef.current.runQuery({
      query,
      hasLimit,
      queryWithoutLimit: statement.text.replaceAll(';', ''),
    }),
    isCancelledPromise,
  ]);

/**
 * Generates a SQL query to create or replace a view with the app prefix.
 *
 * @param {string} fileName - The name of the file with extension.
 * @returns {string} The SQL query to create or replace the view.
 */
export const getCreateViewQuery = (fileName: string): string => {
  const viewName = createName(fileName);

  return `CREATE or REPLACE VIEW ${viewName} AS SELECT * FROM "${fileName}";`;
};

export const buildColumnsQueryWithFilters = (
  database_name?: string,
  schema_name?: string,
): string => {
  let whereClause = '';
  if (database_name || schema_name) {
    const conditions = [];
    if (database_name) conditions.push(`database_name = '${database_name}'`);
    if (schema_name) conditions.push(`schema_name = '${schema_name}'`);
    whereClause = `WHERE ${conditions.join(' AND ')}`;
  }

  return `
    SELECT
      database_name,
      schema_name,
      table_name,
      column_name,
      column_index,
      data_type,
      is_nullable
    FROM duckdb_columns()
    ${whereClause}
    ORDER BY database_name, schema_name, table_name, column_index;
  `;
};

/**
 * Checks if the file handle has permission to read the file.
 */
export const verifyPermission = async (fileHandle: FileSystemFileHandle) => {
  if ((await fileHandle.queryPermission()) === 'granted') {
    return true;
  }

  return false;
};

export const exportFilesAsArchive = async (proxyRef: React.RefObject<SessionWorker | null>) => {
  if (!proxyRef.current) return;
  try {
    const result = await proxyRef.current.exportFilesAsArchive();
    if (!result) throw new Error('Failed to export files as archive');

    return result;
  } catch (error) {
    console.error('Error exporting files as archive: ', error);
    return null;
  }
};
