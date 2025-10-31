import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@uiw/react-codemirror';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

export enum SQLStatement {
  ANALYZE = 'ANALYZE',
  ALTER = 'ALTER', // ALTER TABLE, ALTER VIEW
  ATTACH = 'ATTACH',
  DETACH = 'DETACH',
  CALL = 'CALL',
  CHECKPOINT = 'CHECKPOINT',
  FORCE_CHECKPOINT = 'FORCE_CHECKPOINT',
  COMMENT_ON = 'COMMENT_ON',
  COPY = 'COPY',
  CREATE = 'CREATE', // For simplicity, all create statements (index, macro, schema, secret, sequence, table, view, type
  DROP = 'DROP', // Same as for create
  DELETE = 'DELETE',
  TRUNCATE = 'TRUNCATE', // Is an alias for DELETE FROM without WHERE
  DESCRIBE = 'DESCRIBE',
  SHOW = 'SHOW', // Is an alias for DESCRIBE
  EXPORT_DATABASE = 'EXPORT_DATABASE',
  IMPORT_DATABASE = 'IMPORT_DATABASE',
  INSERT = 'INSERT',
  INSTALL = 'INSTALL',
  LOAD = 'LOAD',
  PIVOT = 'PIVOT',
  UNPIVOT = 'UNPIVOT',
  FROM = 'FROM', // FROM table UNPIVOT...
  EXPLAIN = 'EXPLAIN', // EXPLAIN, EXPLAIN ANALYZE
  SELECT = 'SELECT',
  SET = 'SET', // SET (configuration option), SET VARIABLE
  RESET = 'RESET', // RESET (configuration option), RESET VARIABLE
  SUMMARIZE = 'SUMMARIZE',
  BEGIN_TRANSACTION = 'BEGIN_TRANSACTION',
  COMMIT = 'COMMIT',
  ROLLBACK = 'ROLLBACK',
  ABORT = 'ABORT', // Identical to ROLLBACK
  UPDATE = 'UPDATE',
  WITH = 'WITH', // CTE
  USE = 'USE',
  VACUUM = 'VACUUM',
  UNKNOWN = 'UNKNOWN',
}

export const enum SQLStatementType {
  DDL = 'DDL', // Data Definitions
  DML = 'DML', // Data Manipulations
  TCL = 'TCL', // Transaction Controls
  UTL = 'UTL', // Utility Commands
  UNKNOWN = 'UNKNOWN', // Unknown type
}

const StatementTypeMap: Record<SQLStatement, SQLStatementType> = {
  [SQLStatement.ANALYZE]: SQLStatementType.UTL,
  [SQLStatement.ALTER]: SQLStatementType.DDL,
  [SQLStatement.ATTACH]: SQLStatementType.UTL,
  [SQLStatement.DETACH]: SQLStatementType.UTL,
  [SQLStatement.CALL]: SQLStatementType.DML, // Since custom Stored Procedures are not allowed, and I believe all built-in functions are DML - like duckdb_functions() and pragma_table_info()
  [SQLStatement.CHECKPOINT]: SQLStatementType.UTL,
  [SQLStatement.FORCE_CHECKPOINT]: SQLStatementType.UTL,
  [SQLStatement.COMMENT_ON]: SQLStatementType.DDL,
  [SQLStatement.COPY]: SQLStatementType.UTL,
  [SQLStatement.CREATE]: SQLStatementType.DDL,
  [SQLStatement.DROP]: SQLStatementType.DDL,
  [SQLStatement.DELETE]: SQLStatementType.DML,
  [SQLStatement.TRUNCATE]: SQLStatementType.DML,
  [SQLStatement.DESCRIBE]: SQLStatementType.DML,
  [SQLStatement.SHOW]: SQLStatementType.DML,
  [SQLStatement.EXPORT_DATABASE]: SQLStatementType.UTL,
  [SQLStatement.IMPORT_DATABASE]: SQLStatementType.UTL,
  [SQLStatement.INSERT]: SQLStatementType.DML,
  [SQLStatement.INSTALL]: SQLStatementType.UTL,
  [SQLStatement.LOAD]: SQLStatementType.UTL,
  [SQLStatement.PIVOT]: SQLStatementType.DML,
  [SQLStatement.UNPIVOT]: SQLStatementType.DML,
  [SQLStatement.FROM]: SQLStatementType.DML,
  [SQLStatement.EXPLAIN]: SQLStatementType.UTL,
  [SQLStatement.SELECT]: SQLStatementType.DML,
  [SQLStatement.SET]: SQLStatementType.UTL,
  [SQLStatement.RESET]: SQLStatementType.UTL,
  [SQLStatement.SUMMARIZE]: SQLStatementType.DML,
  [SQLStatement.BEGIN_TRANSACTION]: SQLStatementType.TCL,
  [SQLStatement.COMMIT]: SQLStatementType.TCL,
  [SQLStatement.ROLLBACK]: SQLStatementType.TCL,
  [SQLStatement.ABORT]: SQLStatementType.TCL,
  [SQLStatement.UPDATE]: SQLStatementType.DML,
  [SQLStatement.WITH]: SQLStatementType.UNKNOWN,
  [SQLStatement.USE]: SQLStatementType.UTL,
  [SQLStatement.VACUUM]: SQLStatementType.UTL,
  [SQLStatement.UNKNOWN]: SQLStatementType.UNKNOWN,
};

const TransactionalStatementMap: Record<SQLStatement, boolean> = {
  [SQLStatement.ANALYZE]: false,
  [SQLStatement.ALTER]: true,
  [SQLStatement.ATTACH]: true,
  [SQLStatement.DETACH]: true,
  [SQLStatement.CALL]: false,
  [SQLStatement.CHECKPOINT]: false,
  [SQLStatement.FORCE_CHECKPOINT]: false,
  [SQLStatement.COMMENT_ON]: false,
  [SQLStatement.COPY]: false,
  [SQLStatement.CREATE]: true,
  [SQLStatement.DROP]: true,
  [SQLStatement.DELETE]: true,
  [SQLStatement.TRUNCATE]: true,
  [SQLStatement.DESCRIBE]: false,
  [SQLStatement.SHOW]: false,
  [SQLStatement.EXPORT_DATABASE]: false,
  [SQLStatement.IMPORT_DATABASE]: false,
  [SQLStatement.INSERT]: true,
  [SQLStatement.INSTALL]: false,
  [SQLStatement.LOAD]: false,
  [SQLStatement.PIVOT]: false,
  [SQLStatement.UNPIVOT]: false,
  [SQLStatement.FROM]: false,
  [SQLStatement.EXPLAIN]: false,
  [SQLStatement.SELECT]: false,
  [SQLStatement.SET]: false,
  [SQLStatement.RESET]: false,
  [SQLStatement.SUMMARIZE]: false,
  [SQLStatement.BEGIN_TRANSACTION]: false, // Nested transactions are not supported
  [SQLStatement.COMMIT]: false,
  [SQLStatement.ROLLBACK]: false,
  [SQLStatement.ABORT]: false,
  [SQLStatement.UPDATE]: true,
  [SQLStatement.WITH]: false,
  [SQLStatement.USE]: false, // CTE can be anything, but without parsing the whole statement, let's assume it's always same as SELECT
  [SQLStatement.VACUUM]: false,
  [SQLStatement.UNKNOWN]: false,
};

const StatementsAllowedInScripts = [
  SQLStatement.ATTACH,
  SQLStatement.DETACH,
  SQLStatement.ANALYZE,
  SQLStatement.ALTER,
  SQLStatement.CALL,
  SQLStatement.CHECKPOINT, // Fails in transactions. Do not allow FORCE CHECKPOINT to avoid potentially unexpected aborting of any running transactions.
  SQLStatement.COMMENT_ON,
  SQLStatement.CREATE,
  SQLStatement.DROP,
  SQLStatement.DELETE,
  SQLStatement.TRUNCATE,
  SQLStatement.DESCRIBE,
  SQLStatement.SHOW,
  SQLStatement.INSERT,
  SQLStatement.PIVOT,
  SQLStatement.UNPIVOT,
  SQLStatement.FROM,
  SQLStatement.EXPLAIN,
  SQLStatement.SELECT,
  SQLStatement.SET,
  SQLStatement.RESET,
  SQLStatement.SUMMARIZE,
  SQLStatement.UPDATE,
  SQLStatement.WITH,
  SQLStatement.VACUUM,
];

const StatementsAllowedInSubquery = [SQLStatement.SELECT];

/**
 * The list of SQL statements that we allow to be used
 * as the final script data source.
 */
export const SelectableStatements: SQLStatement[] = [
  SQLStatement.SELECT,
  SQLStatement.WITH,
  SQLStatement.DESCRIBE,
  SQLStatement.SHOW,
  SQLStatement.PIVOT,
  SQLStatement.UNPIVOT,
  SQLStatement.FROM,
  SQLStatement.SUMMARIZE,
  SQLStatement.CALL,
  SQLStatement.EXPLAIN,
];

const StatementSearchMap: Record<SQLStatement, string> = {
  [SQLStatement.ANALYZE]: 'ANALYZE',
  [SQLStatement.ALTER]: 'ALTER',
  [SQLStatement.ATTACH]: 'ATTACH',
  [SQLStatement.DETACH]: 'DETACH',
  [SQLStatement.CALL]: 'CALL',
  [SQLStatement.CHECKPOINT]: 'CHECKPOINT',
  [SQLStatement.FORCE_CHECKPOINT]: 'FORCE',
  [SQLStatement.COMMENT_ON]: 'COMMENT',
  [SQLStatement.COPY]: 'COPY',
  [SQLStatement.CREATE]: 'CREATE',
  [SQLStatement.DROP]: 'DROP',
  [SQLStatement.DELETE]: 'DELETE',
  [SQLStatement.TRUNCATE]: 'TRUNCATE',
  [SQLStatement.DESCRIBE]: 'DESCRIBE',
  [SQLStatement.SHOW]: 'SHOW',
  [SQLStatement.EXPORT_DATABASE]: 'EXPORT',
  [SQLStatement.IMPORT_DATABASE]: 'IMPORT',
  [SQLStatement.INSERT]: 'INSERT',
  [SQLStatement.INSTALL]: 'INSTALL',
  [SQLStatement.LOAD]: 'LOAD',
  [SQLStatement.PIVOT]: 'PIVOT',
  [SQLStatement.UNPIVOT]: 'UNPIVOT',
  [SQLStatement.FROM]: 'FROM',
  [SQLStatement.EXPLAIN]: 'EXPLAIN',
  [SQLStatement.SELECT]: 'SELECT',
  [SQLStatement.SET]: 'SET',
  [SQLStatement.RESET]: 'RESET',
  [SQLStatement.SUMMARIZE]: 'SUMMARIZE',
  [SQLStatement.BEGIN_TRANSACTION]: 'BEGIN',
  [SQLStatement.COMMIT]: 'COMMIT',
  [SQLStatement.ROLLBACK]: 'ROLLBACK',
  [SQLStatement.ABORT]: 'ABORT',
  [SQLStatement.UPDATE]: 'UPDATE',
  [SQLStatement.WITH]: 'WITH',
  [SQLStatement.USE]: 'USE',
  [SQLStatement.VACUUM]: 'VACUUM',
  [SQLStatement.UNKNOWN]: 'UNKNOWN',
};

export const trimQuery = (query: string): string => {
  // Trim whitespaces and semicolons from the end of the query
  const trimmedQuery = query.trim().replace(/[;\s]*$/, '');
  return trimmedQuery;
};

export function splitSQLByStats(editor: EditorState | string): string[] {
  // Retrieve non-empty SQL statements from the code
  if (typeof editor === 'string') {
    editor = EditorState.create({
      doc: editor,
      extensions: [sql({ dialect: PostgreSQL })],
    });
  }
  const { topNode } = syntaxTree(editor);
  const statements = topNode.getChildren('Statement');
  return statements
    .map((node) => editor.doc.sliceString(node.from, node.to))
    .filter((s) => trimQuery(s) !== '');
}

export type ClassifiedSQLStatement = {
  code: string;
  type: SQLStatement;
  sqlType: SQLStatementType;
  needsTransaction: boolean;
  isAllowedInScript: boolean;
  isAllowedInSubquery: boolean;
  // TODO: add hasOrderClause and codeWithoutOrder
};

export function classifySQLStatement(stmt: string): ClassifiedSQLStatement {
  const statementType =
    Object.values(SQLStatement).find((value) =>
      stmt
        .trim()
        .toUpperCase()
        .startsWith(StatementSearchMap[value as SQLStatement]),
    ) || SQLStatement.UNKNOWN;

  return {
    code: stmt,
    type: statementType,
    sqlType: StatementTypeMap[statementType],
    needsTransaction: TransactionalStatementMap[statementType],
    isAllowedInScript: StatementsAllowedInScripts.includes(statementType),
    isAllowedInSubquery: StatementsAllowedInSubquery.includes(statementType),
  };
}

export function classifySQLStatements(stmts: string[]): ClassifiedSQLStatement[] {
  return stmts.map((stmt) => classifySQLStatement(stmt));
}

export const validateStatements = (
  statements: ClassifiedSQLStatement[],
  protectedViews: Set<string>,
): string[] => {
  const errors: string[] = [];

  if (!statements.length) {
    errors.push('No SQL statements found to run.');
  }

  const protectedViewNames = Array.from(protectedViews).map((viewName) =>
    toDuckDBIdentifier(viewName).toLowerCase(),
  );

  let needsTransaction = false;
  let hasCheckpoint = false;

  for (const statement of statements) {
    needsTransaction = needsTransaction || statement.needsTransaction;

    if (!statement.isAllowedInScript) {
      let statMsg: string = statement.type;
      if (statement.type === SQLStatement.UNKNOWN) {
        statMsg =
          statement.code.length > 20 ? `${statement.code.substring(0, 20)}...` : statement.code;
      }
      errors.push(`The \`${statMsg}\` statement is not allowed.`);
      continue;
    }

    if (statement.type === SQLStatement.DROP) {
      // Check all DROP statements against source tables
      const state = EditorState.create({
        doc: statement.code,
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

      if (protectedViewNames.includes(tableName.toLowerCase())) {
        errors.push(
          `Cannot drop object \`${tableName}\` as it is managed by PondPilot (file views and comparison tables are protected).`,
        );
      }
    }

    if (statement.type === SQLStatement.CHECKPOINT) {
      hasCheckpoint = true;
    }
  }

  if (hasCheckpoint && needsTransaction) {
    errors.push(
      'The `CHECKPOINT` statement cannot be used in this context. Please run it separately.',
    );
  }

  return errors;
};
