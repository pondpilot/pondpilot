import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

import { buildByteToCharMap, buildCharToLineMap, getUtf8ByteLength } from './byte-offset';
import { getFlowScopeClient } from '../../workers/flowscope-client';

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

export function trimQuery(query: string): string {
  // Trim whitespaces and semicolons from the end of the query
  return query.trim().replace(/[;\s]*$/, '');
}

function extractDropTarget(statement: string): string | null {
  const match = statement.match(
    /drop\s+(?:table|view|schema|sequence|index|macro|type|function|materialized\s+view)?\s*(?:if\s+exists\s+)?([^\s;]+)/i,
  );
  if (!match) return null;
  return match[1].replace(/^"|"$/g, '');
}

/**
 * Converts a UTF-16 code unit offset (JavaScript string index) to a UTF-8 byte offset.
 *
 * JavaScript strings use UTF-16 internally, but FlowScope returns UTF-8 byte offsets.
 * This function handles surrogate pairs correctly: for...of iterates by code points,
 * while char.length returns the UTF-16 code unit count (1 for BMP, 2 for astral plane).
 *
 * @param text - The source text
 * @param utf16Offset - Offset in UTF-16 code units (JS string index)
 * @returns Offset in UTF-8 bytes
 */
export function toUtf8Offset(text: string, utf16Offset: number): number {
  let byteOffset = 0;
  let charIndex = 0;

  for (const char of text) {
    if (charIndex >= utf16Offset) break;
    byteOffset += getUtf8ByteLength(char);
    // char.length is 1 for BMP characters, 2 for astral plane (surrogate pairs)
    charIndex += char.length;
  }

  return byteOffset;
}

/**
 * Converts a UTF-8 byte offset to a UTF-16 code unit offset (JavaScript string index).
 *
 * JavaScript strings use UTF-16 internally, but FlowScope returns UTF-8 byte offsets.
 * This function handles surrogate pairs correctly: for...of iterates by code points,
 * while char.length returns the UTF-16 code unit count (1 for BMP, 2 for astral plane).
 *
 * @param text - The source text
 * @param byteOffset - Offset in UTF-8 bytes
 * @returns Offset in UTF-16 code units (JS string index)
 */
export function fromUtf8Offset(text: string, byteOffset: number): number {
  let bytes = 0;
  let utf16Index = 0;

  for (const char of text) {
    const charBytes = getUtf8ByteLength(char);
    if (bytes + charBytes > byteOffset) {
      return utf16Index;
    }
    bytes += charBytes;
    // char.length is 1 for BMP characters, 2 for astral plane (surrogate pairs)
    utf16Index += char.length;
  }

  return text.length;
}

/**
 * Strip leading comments and whitespace from SQL to get the actual statement start
 */
function stripLeadingComments(text: string): string {
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const followingChar = text[i + 1];

    // Skip whitespace
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    // Single-line comment - skip to end of line
    if (char === '-' && followingChar === '-') {
      const lineEnd = text.indexOf('\n', i);
      if (lineEnd === -1) {
        return ''; // Rest is just a comment
      }
      i = lineEnd + 1;
      continue;
    }

    // Block comment - skip to end of comment
    if (char === '/' && followingChar === '*') {
      const commentEnd = text.indexOf('*/', i + 2);
      if (commentEnd === -1) {
        return ''; // Rest is just a comment
      }
      i = commentEnd + 2;
      continue;
    }

    // Found actual SQL - return from here
    return text.slice(i);
  }

  return ''; // Only whitespace and comments
}

export type ParsedStatement = {
  code: string;
  lineNumber: number;
  start: number;
  end: number;
};

/**
 * Split SQL into individual statements using FlowScope WASM (runs in Web Worker)
 * This is non-blocking and won't freeze the UI on large files.
 */
export async function splitSQLByStats(sqlText: string): Promise<ParsedStatement[]> {
  if (!sqlText.trim()) {
    return [];
  }

  const client = getFlowScopeClient();
  const result = await client.split(sqlText);

  if (!result.statements.length) {
    return [];
  }

  // Collect unique byte offsets for batch conversion
  const byteOffsets = new Set<number>();
  for (const span of result.statements) {
    byteOffsets.add(span.start);
    byteOffsets.add(span.end);
  }

  // Build byte-to-char offset map using shared utility
  const byteToCharMap = buildByteToCharMap(sqlText, Array.from(byteOffsets));

  // Collect character positions for line number mapping
  // Use filtered positions since we'll handle missing mappings in the main loop
  const charPositions: number[] = [];
  for (const span of result.statements) {
    const charPos = byteToCharMap.get(span.start);
    if (charPos !== undefined) {
      charPositions.push(charPos);
    }
  }

  // Build line number map using shared utility
  const charToLineMap = buildCharToLineMap(sqlText, charPositions);

  return result.statements.map((span: { start: number; end: number }) => {
    const startIndex = byteToCharMap.get(span.start);
    const endIndex = byteToCharMap.get(span.end);

    if (startIndex === undefined || endIndex === undefined) {
      const message = `Missing byte-to-char mapping for span: start=${span.start}, end=${span.end}`;
      if (import.meta.env.DEV) {
        throw new Error(message);
      }
      console.error(message);
      // Fallback: return the entire text as a single statement to avoid crashes
      return {
        code: sqlText,
        lineNumber: 1,
        start: 0,
        end: sqlText.length,
      };
    }

    return {
      code: sqlText.slice(startIndex, endIndex),
      lineNumber: charToLineMap.get(startIndex) ?? 1,
      start: startIndex,
      end: endIndex,
    };
  });
}

export type ClassifiedSQLStatement = {
  code: string;
  type: SQLStatement;
  sqlType: SQLStatementType;
  needsTransaction: boolean;
  isAllowedInScript: boolean;
  isAllowedInSubquery: boolean;
  lineNumber: number;
  statementIndex: number;
};

/**
 * Classify a single SQL statement (for use outside of script execution).
 * Line number defaults to 1 and statement index to 0.
 */
export function classifySQLStatement(code: string): ClassifiedSQLStatement {
  const strippedStmt = stripLeadingComments(code);

  const statementType =
    Object.values(SQLStatement).find((value) =>
      strippedStmt
        .trim()
        .toUpperCase()
        .startsWith(StatementSearchMap[value as SQLStatement]),
    ) || SQLStatement.UNKNOWN;

  return {
    code,
    type: statementType,
    sqlType: StatementTypeMap[statementType],
    needsTransaction: TransactionalStatementMap[statementType],
    isAllowedInScript: StatementsAllowedInScripts.includes(statementType),
    isAllowedInSubquery: StatementsAllowedInSubquery.includes(statementType),
    lineNumber: 1,
    statementIndex: 0,
  };
}

export function classifySQLStatements(stmts: ParsedStatement[]): ClassifiedSQLStatement[] {
  return stmts.map((stmt, index) => {
    const strippedStmt = stripLeadingComments(stmt.code);

    const statementType =
      Object.values(SQLStatement).find((value) =>
        strippedStmt
          .trim()
          .toUpperCase()
          .startsWith(StatementSearchMap[value as SQLStatement]),
      ) || SQLStatement.UNKNOWN;

    return {
      code: stmt.code,
      type: statementType,
      sqlType: StatementTypeMap[statementType],
      needsTransaction: TransactionalStatementMap[statementType],
      isAllowedInScript: StatementsAllowedInScripts.includes(statementType),
      isAllowedInSubquery: StatementsAllowedInSubquery.includes(statementType),
      lineNumber: stmt.lineNumber,
      statementIndex: index,
    };
  });
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
      const tableName = extractDropTarget(statement.code);
      if (tableName && protectedViewNames.includes(tableName.toLowerCase())) {
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
