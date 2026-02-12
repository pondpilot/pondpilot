import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { syncFiles } from '@controllers/file-system';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
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

import { getAutoCellViewName, parseUserCellName, validateCellName } from '../utils/cell-naming';

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
  /** 0-based index of the cell in the notebook (for auto-naming) */
  cellIndex?: number;
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
  const { pool, sql, protectedViews, abortSignal, sharedConnection, cellIndex } = options;

  if (!sql.trim()) {
    return { lastQuery: null, error: null };
  }

  // Split and classify statements
  const statements = await splitSQLByStats(sql);
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

    // Create temp views for cross-cell referencing (only with shared connection)
    if (sharedConnection && cellIndex !== undefined) {
      await createCellTempViews(conn, sql, cellIndex);
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
 * Creates both an auto-generated view (`__cell_N`) and optionally a user-defined
 * view if a `-- @name: my_view` annotation is present in the first line.
 *
 * Only creates views when the cell contains a single SELECT-like statement that
 * can be wrapped in `CREATE OR REPLACE TEMP VIEW ... AS (...)`.
 * Multi-statement cells or DDL-only cells are skipped gracefully.
 */
async function createCellTempViews(
  conn: AsyncDuckDBPooledConnection,
  sql: string,
  cellIndex: number,
): Promise<void> {
  // Determine the SQL to wrap in a view — use the full cell SQL.
  // Multi-statement cells may fail to create a view, which is fine.
  const viewSql = sql.trim();
  if (!viewSql) return;

  // Strip any user-name annotation line from the SQL used for the view body
  const lines = viewSql.split('\n');
  const userCellName = parseUserCellName(viewSql);
  const bodyLines = userCellName ? lines.slice(1) : lines;
  const viewBody = bodyLines.join('\n').trim();

  if (!viewBody) return;

  // Create the auto-generated view: __cell_N
  const autoName = getAutoCellViewName(cellIndex);
  try {
    await conn.query(`CREATE OR REPLACE TEMP VIEW "${autoName}" AS (${viewBody})`);
  } catch {
    // View creation can fail for multi-statement cells, DDL, etc. — skip gracefully
  }

  // Create the user-defined view if a valid name annotation exists
  if (userCellName) {
    const validationError = validateCellName(userCellName);
    if (!validationError) {
      try {
        await conn.query(
          `CREATE OR REPLACE TEMP VIEW "${userCellName}" AS (${viewBody})`,
        );
      } catch {
        // Skip gracefully — the SQL may not be wrappable as a view
      }
    }
  }
}
