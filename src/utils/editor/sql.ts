import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { syntaxTree } from '@codemirror/language';
import { analyzeSql, initWasm } from '@pondpilot/flowscope-core';
import type { AnalyzeRequest, AnalyzeResult } from '@pondpilot/flowscope-core';
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

export function trimQuery(query: string): string {
  // Trim whitespaces and semicolons from the end of the query
  return query.trim().replace(/[;\s]*$/, '');
}

/**
 * Strip leading comments and whitespace from SQL to get the actual statement start
 */
function stripLeadingComments(text: string): string {
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    // Skip whitespace
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    // Single-line comment - skip to end of line
    if (char === '-' && nextChar === '-') {
      const lineEnd = text.indexOf('\n', i);
      if (lineEnd === -1) {
        return ''; // Rest is just a comment
      }
      i = lineEnd + 1;
      continue;
    }

    // Block comment - skip to end of comment
    if (char === '/' && nextChar === '*') {
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

type StatementRange = {
  start: number;
  end: number;
};

const FLOW_SCOPE_WASM_URL = '/wasm/flowscope_wasm_bg.wasm';
let flowScopeInitPromise: Promise<unknown> | null = null;

async function ensureFlowScopeWasm(): Promise<void> {
  if (!flowScopeInitPromise) {
    flowScopeInitPromise = initWasm({ wasmUrl: FLOW_SCOPE_WASM_URL });
  }

  await flowScopeInitPromise;
}

async function analyzeSqlWithFlowScope(request: AnalyzeRequest): Promise<AnalyzeResult> {
  await ensureFlowScopeWasm();
  return analyzeSql(request);
}

async function getStatementCount(sqlText: string): Promise<number | null> {
  try {
    const result = await analyzeSqlWithFlowScope({
      sql: sqlText,
      dialect: 'duckdb',
    });

    if (result.summary?.hasErrors) {
      return null;
    }

    if (typeof result.summary?.statementCount === 'number') {
      return result.summary.statementCount;
    }

    return result.statements.length;
  } catch (error) {
    console.warn('FlowScope SQL analysis failed, falling back to range count.', error);
    return null;
  }
}

function nextChar(sql: string, index: number): { char: string; advance: number } {
  const codePoint = sql.codePointAt(index);
  if (codePoint === undefined) {
    return { char: '', advance: 1 };
  }
  const char = String.fromCodePoint(codePoint);
  return { char, advance: char.length };
}

function charAt(sql: string, index: number): { char: string; advance: number } | null {
  if (index >= sql.length) {
    return null;
  }
  const codePoint = sql.codePointAt(index);
  if (codePoint === undefined) {
    return null;
  }
  const char = String.fromCodePoint(codePoint);
  return { char, advance: char.length };
}

function startsWithAt(sql: string, index: number, pattern: string): boolean {
  if (index >= sql.length) {
    return false;
  }
  return sql.startsWith(pattern, index);
}

function detectDollarQuote(
  sql: string,
  start: number,
): { delimiter: string; endIndex: number } | null {
  if (start + 1 >= sql.length) {
    return null;
  }

  let index = start + 1;
  while (index < sql.length) {
    const { char, advance } = nextChar(sql, index);
    index += advance;
    if (char === '$') {
      return { delimiter: sql.slice(start, index), endIndex: index };
    }
    if (!/[_a-zA-Z0-9]/.test(char)) {
      return null;
    }
  }

  return null;
}

function skipLineComment(sql: string, index: number, end: number): number {
  let cursor = index;
  while (cursor < end) {
    const char = sql[cursor];
    cursor += 1;
    if (char === '\n' || char === '\r') {
      break;
    }
  }
  return cursor;
}

function skipBlockComment(sql: string, index: number, end: number): number {
  let cursor = index;
  while (cursor < end) {
    if (cursor + 1 < end && sql[cursor] === '*' && sql[cursor + 1] === '/') {
      return cursor + 2;
    }
    cursor += 1;
  }
  return end;
}

function trimStatementRange(sql: string, start: number, end: number): StatementRange | null {
  if (start >= end) {
    return null;
  }

  let cursorStart = start;
  let cursorEnd = end;

  while (cursorStart < cursorEnd) {
    if (cursorStart + 1 < cursorEnd) {
      const first = sql[cursorStart];
      const second = sql[cursorStart + 1];
      if (first === '-' && second === '-') {
        cursorStart = skipLineComment(sql, cursorStart + 2, cursorEnd);
        continue;
      }
      if (first === '/' && second === '*') {
        cursorStart = skipBlockComment(sql, cursorStart + 2, cursorEnd);
        continue;
      }
    }

    const char = sql[cursorStart];
    if (char === '#') {
      cursorStart = skipLineComment(sql, cursorStart + 1, cursorEnd);
      continue;
    }
    if (/\s/.test(char)) {
      cursorStart += 1;
      continue;
    }
    break;
  }

  while (cursorStart < cursorEnd && /\s/.test(sql[cursorEnd - 1])) {
    cursorEnd -= 1;
  }

  if (cursorStart >= cursorEnd) {
    return null;
  }

  return { start: cursorStart, end: cursorEnd };
}

function pushStatementRange(ranges: StatementRange[], sql: string, start: number, end: number) {
  const trimmed = trimStatementRange(sql, start, end);
  if (trimmed) {
    ranges.push(trimmed);
  }
}

function computeStatementRanges(sql: string): StatementRange[] {
  const ranges: StatementRange[] = [];
  if (!sql) {
    return ranges;
  }

  let start = 0;
  let index = 0;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarDelimiter: string | null = null;

  while (index < sql.length) {
    if (dollarDelimiter) {
      if (sql.startsWith(dollarDelimiter, index)) {
        index += dollarDelimiter.length;
        dollarDelimiter = null;
      } else {
        const { advance } = nextChar(sql, index);
        index += advance;
      }
      continue;
    }

    if (inLineComment) {
      const { char, advance } = nextChar(sql, index);
      index += advance;
      if (char === '\n' || char === '\r') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (startsWithAt(sql, index, '*/')) {
        index += 2;
        inBlockComment = false;
      } else {
        const { advance } = nextChar(sql, index);
        index += advance;
      }
      continue;
    }

    if (inSingleQuote) {
      const { char, advance } = nextChar(sql, index);
      index += advance;
      if (char === "'") {
        const next = charAt(sql, index);
        if (next?.char === "'") {
          index += next.advance;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      const { char, advance } = nextChar(sql, index);
      index += advance;
      if (char === '"') {
        const next = charAt(sql, index);
        if (next?.char === '"') {
          index += next.advance;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    if (inBacktick) {
      const { char, advance } = nextChar(sql, index);
      index += advance;
      if (char === '`') {
        const next = charAt(sql, index);
        if (next?.char === '`') {
          index += next.advance;
        } else {
          inBacktick = false;
        }
      }
      continue;
    }

    if (inBracket) {
      const { char, advance } = nextChar(sql, index);
      index += advance;
      if (char === ']') {
        const next = charAt(sql, index);
        if (next?.char === ']') {
          index += next.advance;
        } else {
          inBracket = false;
        }
      }
      continue;
    }

    const { char, advance } = nextChar(sql, index);
    switch (char) {
      case "'":
        inSingleQuote = true;
        index += advance;
        continue;
      case '"':
        inDoubleQuote = true;
        index += advance;
        continue;
      case '`':
        inBacktick = true;
        index += advance;
        continue;
      case '[':
        inBracket = true;
        index += advance;
        continue;
      case '-':
        if (startsWithAt(sql, index + advance, '-')) {
          inLineComment = true;
          index += advance + 1;
          continue;
        }
        break;
      case '#':
        inLineComment = true;
        index += advance;
        continue;
      case '/':
        if (startsWithAt(sql, index + advance, '*')) {
          inBlockComment = true;
          index += advance + 1;
          continue;
        }
        break;
      case '$': {
        const delimiter = detectDollarQuote(sql, index);
        if (delimiter) {
          dollarDelimiter = delimiter.delimiter;
          index = delimiter.endIndex;
          continue;
        }
        break;
      }
      case ';':
        pushStatementRange(ranges, sql, start, index);
        start = index + advance;
        break;
      default:
        break;
    }

    index += advance;
  }

  pushStatementRange(ranges, sql, start, sql.length);
  return ranges;
}

async function mergeStatementRanges(
  sql: string,
  ranges: StatementRange[],
  statementCount: number,
): Promise<StatementRange[]> {
  if (ranges.length <= statementCount) {
    return ranges;
  }

  const merged: StatementRange[] = [];
  let rangeIndex = 0;

  for (let statementIndex = 0; statementIndex < statementCount; statementIndex += 1) {
    if (rangeIndex >= ranges.length) {
      return ranges;
    }

    let current = { ...ranges[rangeIndex] };
    rangeIndex += 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snippet = sql.slice(current.start, current.end);
      const parsedCount = await getStatementCount(snippet);
      if (parsedCount === 1) {
        merged.push(current);
        break;
      }

      if (rangeIndex >= ranges.length || parsedCount === null) {
        return ranges;
      }

      current = { start: current.start, end: ranges[rangeIndex].end };
      rangeIndex += 1;
    }
  }

  if (rangeIndex !== ranges.length) {
    return ranges;
  }

  return merged;
}

export type ParsedStatement = {
  code: string;
  lineNumber: number;
};

export async function splitSQLByStats(editor: EditorState | string): Promise<ParsedStatement[]> {
  const sqlText = typeof editor === 'string' ? editor : editor.doc.toString();
  const state = typeof editor === 'string' ? EditorState.create({ doc: sqlText }) : editor;
  const ranges = computeStatementRanges(sqlText);
  if (ranges.length === 0) {
    return [];
  }

  const statementCount = await getStatementCount(sqlText);
  const alignedRanges =
    statementCount === null ? ranges : await mergeStatementRanges(sqlText, ranges, statementCount);

  return alignedRanges.map((range) => ({
    code: sqlText.slice(range.start, range.end),
    lineNumber: state.doc.lineAt(range.start).number,
  }));
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
