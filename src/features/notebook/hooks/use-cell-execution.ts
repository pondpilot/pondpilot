import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { syncFiles } from '@controllers/file-system';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { NotebookParameter } from '@models/notebook';
import { useAppStore } from '@store/app-store';
import {
  handleAttachStatements,
  handleCreateSecretStatements,
  handleDetachStatements,
} from '@utils/attach-detach-handler';
import {
  splitSQLByStats,
  classifySQLStatements,
  validateStatements,
  SelectableStatements,
  SQLStatementType,
  SQLStatement,
} from '@utils/editor/sql';
import { isNotReadableError, getErrorMessage } from '@utils/error-classification';
import { pooledConnectionQueryWithCorsRetry } from '@utils/query-with-cors-retry';

import { normalizeCellName, validateCellName } from '../utils/cell-naming';
import { resolveNotebookParametersInSql } from '../utils/parameters';

const SECRET_STATEMENT_PATTERN = /\b(ALTER|CREATE)\s+(?:OR\s+REPLACE\s+)?SECRET\b/i;

/**
 * Options for cell execution. When a shared notebook connection is provided,
 * temp views are created for cross-cell referencing.
 */
export type CellExecutionOptions = {
  /** The DuckDB connection pool (used for metadata refresh) */
  pool: AsyncDuckDBConnectionPool;
  /** SQL content of the cell */
  sql: string;
  /** Protected view names that cannot be modified */
  protectedViews: Set<string>;
  /** Signal to cancel execution */
  abortSignal: AbortSignal;
  /** Shared notebook connection for temp view persistence */
  sharedConnection?: AsyncDuckDBPooledConnection;
  /** Stable SQL view reference for this cell (e.g. __pp_cell_xxx) */
  cellRef?: string;
  /** Optional human alias for this cell. */
  cellName?: string | null;
  /** Notebook parameters for SQL interpolation. */
  parameters?: NotebookParameter[];
};

/**
 * Executes a single SQL cell's content using the DuckDB connection pool.
 *
 * Follows the same execution pattern as script-tab-view.tsx:
 * 1. Split SQL into statements
 * 2. Classify and validate
 * 3. Execute in transaction if multiple DDL statements
 * 4. For the last SELECT-like statement, validate via prepare (return query for data adapter)
 * 5. Refresh metadata on DDL
 * 6. Create temp views for cross-cell referencing (when shared connection is used)
 *
 * Returns the last SELECT-like query for the data adapter to stream from,
 * or null if no displayable result was produced (e.g., DDL-only cell).
 */
export async function executeCellSQL(
  options: CellExecutionOptions,
): Promise<{ lastQuery: string | null; error: string | null }> {
  const {
    pool,
    sql,
    protectedViews,
    abortSignal,
    sharedConnection,
    cellRef,
    cellName,
    parameters,
  } = options;

  if (!sql.trim()) {
    return { lastQuery: null, error: null };
  }

  const resolvedSql = resolveNotebookParametersInSql(sql, parameters);
  if (resolvedSql.errors.length > 0) {
    return { lastQuery: null, error: resolvedSql.errors.join('\n') };
  }

  // Split and classify statements
  const statements = await splitSQLByStats(resolvedSql.sql);
  const classifiedStatements = classifySQLStatements(statements);

  // Validate
  const errors = validateStatements(classifiedStatements, protectedViews);
  if (errors.length > 0) {
    return { lastQuery: null, error: errors.join('\n') };
  }

  if (classifiedStatements.length === 0) {
    return { lastQuery: null, error: null };
  }

  // Use shared connection if available, otherwise get a fresh one from the pool
  const conn = sharedConnection ?? (await pool.getPooledConnection());
  const ownsConnection = !sharedConnection;

  const needsTransaction =
    classifiedStatements.length > 1 && classifiedStatements.some((s) => s.needsTransaction);
  const rollbackOnCorsError = !needsTransaction;

  const runQueryWithRetry = async (code: string) => {
    try {
      await pooledConnectionQueryWithCorsRetry(conn, code, { rollbackOnCorsError });
    } catch (error: unknown) {
      if (isNotReadableError(error)) {
        await syncFiles(pool);
        await pooledConnectionQueryWithCorsRetry(conn, code, { rollbackOnCorsError });
      } else {
        throw error;
      }
    }
  };

  let lastQuery: string | null = null;

  try {
    if (abortSignal.aborted) {
      return { lastQuery: null, error: 'Execution cancelled' };
    }

    if (needsTransaction) {
      await conn.query('BEGIN TRANSACTION');
    }

    // Execute all statements except the last
    const statsExceptLast = classifiedStatements.slice(0, -1);
    for (const statement of statsExceptLast) {
      if (abortSignal.aborted) {
        if (needsTransaction) {
          await conn.query('ROLLBACK');
        }
        return { lastQuery: null, error: 'Execution cancelled' };
      }
      try {
        await runQueryWithRetry(statement.code);
      } catch (error) {
        const message = getErrorMessage(error);
        if (needsTransaction) {
          await conn.query('ROLLBACK');
        }
        const statementNum = statement.statementIndex + 1;
        return {
          lastQuery: null,
          error: `Line ${statement.lineNumber}, statement ${statementNum} (${statement.type}):\n${message}`,
        };
      }
    }

    // Handle the last statement
    const lastStatement = classifiedStatements[classifiedStatements.length - 1];

    if (SelectableStatements.includes(lastStatement.type)) {
      // Validate the SELECT via prepare
      try {
        const preparedStatement = await conn.prepare(lastStatement.code);
        await preparedStatement.close();
      } catch (error) {
        const message = getErrorMessage(error);
        if (needsTransaction) {
          await conn.query('ROLLBACK');
        }
        const statementNum = lastStatement.statementIndex + 1;
        return {
          lastQuery: null,
          error: `Line ${lastStatement.lineNumber}, statement ${statementNum} (${lastStatement.type}):\n${message}`,
        };
      }
      lastQuery = lastStatement.code;
    } else {
      // Non-SELECT last statement - execute it
      try {
        await runQueryWithRetry(lastStatement.code);
      } catch (error) {
        const message = getErrorMessage(error);
        if (needsTransaction) {
          await conn.query('ROLLBACK');
        }
        const statementNum = lastStatement.statementIndex + 1;
        return {
          lastQuery: null,
          error: `Line ${lastStatement.lineNumber}, statement ${statementNum} (${lastStatement.type}):\n${message}`,
        };
      }
      lastQuery = "SELECT 'All statements executed successfully' as Result";
    }

    // Commit if we used a transaction
    if (needsTransaction) {
      await conn.query('COMMIT');
    }

    // Create temp views for cross-cell referencing (only with shared connection).
    // Use the last SELECT statement for the view body so multi-statement cells work.
    if (sharedConnection && cellRef) {
      const viewQuery =
        lastQuery && lastQuery !== "SELECT 'All statements executed successfully' as Result"
          ? lastQuery
          : null;
      await createCellTempViews(conn, resolvedSql.sql, cellRef, cellName, viewQuery);
    }

    // Handle DDL side effects (refresh metadata)
    const hasDDL = classifiedStatements.some((s) => s.sqlType === SQLStatementType.DDL);
    const hasAttachDetach = classifiedStatements.some(
      (s) => s.type === SQLStatement.ATTACH || s.type === SQLStatement.DETACH,
    );
    const hasCreateSecret = classifiedStatements.some(
      (s) => s.type === SQLStatement.CREATE && SECRET_STATEMENT_PATTERN.test(s.code),
    );

    if (hasDDL || hasAttachDetach) {
      const attachedDatabasesResult = await conn.query(
        'SELECT DISTINCT database_name FROM duckdb_databases() WHERE NOT internal',
      );
      const attachedDatabases = attachedDatabasesResult.toArray();
      const dbNames = attachedDatabases.map((row: any) => row.database_name);

      const newMetadata = await getDatabaseModel(pool, dbNames);
      const { databaseMetadata, dataSources } = useAppStore.getState();
      const updatedMetadata = new Map(databaseMetadata);
      const updatedDataSources = new Map(dataSources);

      for (const [dbName, dbModel] of newMetadata) {
        updatedMetadata.set(dbName, dbModel);
      }

      let secretMapping: Awaited<ReturnType<typeof handleCreateSecretStatements>> | undefined;
      if (hasCreateSecret) {
        secretMapping = await handleCreateSecretStatements(classifiedStatements);
      }

      if (hasAttachDetach) {
        const handlerContext = { dataSources, updatedDataSources, updatedMetadata };
        await handleAttachStatements(classifiedStatements, handlerContext, secretMapping);
        await handleDetachStatements(classifiedStatements, handlerContext);
      }

      useAppStore.setState(
        {
          databaseMetadata: updatedMetadata,
          dataSources: updatedDataSources,
        },
        undefined,
        'AppStore/notebookCell/refreshMetadata',
      );
    } else if (hasCreateSecret) {
      await handleCreateSecretStatements(classifiedStatements);
    }

    return { lastQuery, error: null };
  } finally {
    // Only close if we own the connection (not shared)
    if (ownsConnection) {
      await conn.close();
    }
  }
}

/**
 * Creates temp views for a cell's SQL result so downstream cells can reference it.
 *
 * Creates the stable machine view (`cellRef`) and optionally a user alias view.
 *
 * When `lastSelectQuery` is provided (the last SELECT-like statement from
 * execution), it is used as the view body. This allows multi-statement cells
 * (e.g. `CREATE TABLE t(...); SELECT * FROM t`) to still produce a temp view
 * from their final SELECT. Falls back to the full cell SQL when no specific
 * SELECT query is available.
 */
async function createCellTempViews(
  conn: AsyncDuckDBPooledConnection,
  sql: string,
  cellRef: string,
  cellName: string | null | undefined,
  lastSelectQuery: string | null,
): Promise<void> {
  // Prefer the extracted last SELECT statement; fall back to full cell SQL.
  let viewBody: string;
  if (lastSelectQuery) {
    viewBody = lastSelectQuery.trim();
  } else {
    const viewSql = sql.trim();
    if (!viewSql) return;
    viewBody = viewSql;
  }

  if (!viewBody) return;

  const userCellName = normalizeCellName(cellName);

  // Create the stable machine view for this cell (e.g. __pp_cell_<id>)
  try {
    await conn.query(`CREATE OR REPLACE TEMP VIEW "${cellRef}" AS (${viewBody})`);
  } catch {
    // View creation can fail for non-SELECT content — skip gracefully
  }

  // Create the user-defined view when a valid alias is set.
  if (userCellName) {
    const validationError = validateCellName(userCellName);
    if (!validationError) {
      try {
        await conn.query(`CREATE OR REPLACE TEMP VIEW "${userCellName}" AS (${viewBody})`);
      } catch {
        // Skip gracefully — the SQL may not be wrappable as a view
      }
    }
  }
}
