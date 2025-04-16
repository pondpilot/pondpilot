import { EditorState } from '@uiw/react-codemirror';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { syntaxTree } from '@codemirror/language';

import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { splitSqlQuery } from '../../utils/editor/statement-parser';
import { DBRunQueryProps, runQueryDeprecated, RunQueryResponse } from './db-worker';

interface QueryStatement {
  text: string;
  isSelect: boolean;
  isUse: boolean;
  isDrop: boolean;
}

interface ExecuteQueriesProps {
  runQueryProps: DBRunQueryProps;
  conn: AsyncDuckDBConnectionPool;
  isCancelledPromise: Promise<never>;
  protectedViews: Set<string> | null;
}

interface QueryResult {
  queryResults: RunQueryResponse | undefined;
  originalQuery: string;
}

export const executeQueries = async ({
  runQueryProps,
  conn,
  isCancelledPromise,
  protectedViews,
}: ExecuteQueriesProps): Promise<QueryResult> => {
  const statements = parseStatements(runQueryProps.query);

  await validateStatements(statements, protectedViews);

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
  protectedViews: Set<string> | null,
): Promise<void> => {
  if (!statements.length) {
    throw new Error('No valid SQL statements found');
  }

  const useStatements = statements.filter((s) => s.isUse);
  if (useStatements.length > 0) {
    throw new Error('USE statements are not supported');
  }

  if (!protectedViews?.size) return;

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

    const isSourceTable = protectedViews
      .values()
      .some((viewName) => toDuckDBIdentifier(viewName).toLowerCase() === tableName.toLowerCase());

    if (isSourceTable) {
      throw new Error(
        `Cannot drop view \`${tableName}\` as it is an app managed view providing access to a source file`,
      );
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
  conn: AsyncDuckDBConnectionPool;
  isCancelledPromise: Promise<never>;
  statement: QueryStatement;
  hasLimit: boolean;
}): Promise<RunQueryResponse> =>
  Promise.race([
    runQueryDeprecated({
      conn,
      query,
      hasLimit,
      queryWithoutLimit: statement.text.replaceAll(';', ''),
    }),
    isCancelledPromise,
  ]);
