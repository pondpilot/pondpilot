import { EditorState } from '@uiw/react-codemirror';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { syntaxTree } from '@codemirror/language';
import { tableFromIPC } from 'apache-arrow';
import { DataBaseModel, Dataset } from '@models/common';
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { splitSqlQuery } from '../../utils/editor/statement-parser';
import { DBRunQueryProps, RunQueryResponse } from './models';
import { dbApiProxi } from './db-worker';

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
  conn: AsyncDuckDBConnection,
  databases: string[],
): Promise<DataBaseModel[]> => {
  const duckdbColumns = await dbApiProxi.getTablesAndColumns(conn);
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
  conn: AsyncDuckDBConnection;
  isCancelledPromise: Promise<never>;
  currentSources: Dataset[] | null;
}

interface QueryResult {
  queryResults: RunQueryResponse | undefined;
  originalQuery: string;
}

export const executeQueries = async ({
  runQueryProps,
  conn,
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
      conn,
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
  currentSources: Dataset[] | null,
): Promise<void> => {
  if (!statements.length) {
    throw new Error('No valid SQL statements found');
  }

  const useStatements = statements.filter((s) => s.isUse);
  if (useStatements.length > 0) {
    throw new Error('USE statements are not supported');
  }

  if (!currentSources?.length) return;

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

    const isSourceTable = currentSources.some(
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
    ? `select * from (${clearedQuery}) LIMIT ${runQueryProps.limit || 100} OFFSET ${runQueryProps.offset || 0}`
    : statement.text;
};

const executeStatement = async ({
  query,
  conn,
  isCancelledPromise,
  statement,
  hasLimit,
}: {
  query: string;
  conn: AsyncDuckDBConnection;
  isCancelledPromise: Promise<never>;
  statement: QueryStatement;
  hasLimit: boolean;
}): Promise<RunQueryResponse> =>
  Promise.race([
    dbApiProxi.runQuery({
      conn,
      query,
      hasLimit,
      queryWithoutLimit: statement.text.replaceAll(';', ''),
    }),
    isCancelledPromise,
  ]);
