import { showWarning } from '@components/app-notifications';
import { dropComparisonResultsTable } from '@controllers/comparison/table-utils';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { invalidateRowCountCacheForDatabase } from '@features/comparison/hooks/row-count-cache';
import { Comparison } from '@models/comparison';
import { DataBaseModel, DBSchema } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { useAppStore } from '@store/app-store';
import { isComparisonResultsTableName } from '@utils/comparison';

/**
 * Refreshes database metadata for specified databases and updates the global store
 *
 * This function queries the database to get updated schema information for the specified
 * databases and merges the results with the existing metadata in the application store.
 * Used after operations that might change database structure (CREATE, DROP, ALTER, etc.)
 *
 * Error Handling:
 * - Catches all errors and displays user-friendly warning notifications
 * - Does not throw errors to avoid breaking the calling code
 * - Logs errors for debugging purposes
 *
 * @param conn - Active DuckDB connection pool for querying metadata
 * @param dbNames - Array of database names to refresh metadata for
 * @returns Promise that resolves when metadata refresh is complete
 */
const MAIN_SCHEMA_NAME = 'main';

type ComparisonCleanupTarget = {
  schema: DBSchema;
  tableName: string;
};

function collectOrphanComparisonTables(
  metadata: Map<string, DataBaseModel>,
  trackedTableNames: Set<string>,
): ComparisonCleanupTarget[] {
  const targets: ComparisonCleanupTarget[] = [];
  const systemDbMetadata = metadata.get(PERSISTENT_DB_NAME);

  if (!systemDbMetadata) {
    return targets;
  }

  for (const schema of systemDbMetadata.schemas) {
    if (schema.name !== MAIN_SCHEMA_NAME) {
      continue;
    }

    for (const object of schema.objects) {
      if (
        object.type === 'table' &&
        isComparisonResultsTableName(object.name) &&
        !trackedTableNames.has(object.name)
      ) {
        targets.push({
          schema,
          tableName: object.name,
        });
      }
    }
  }

  return targets;
}

export async function refreshDatabaseMetadata(
  conn: ConnectionPool,
  dbNames: string[],
  options?: {
    comparisons?: Map<string, Pick<Comparison, 'resultsTableName'>>;
  },
): Promise<void> {
  try {
    const updatedMetadata = await getDatabaseModel(conn, dbNames);
    const comparisons = options?.comparisons ?? useAppStore.getState().comparisons;
    const trackedComparisonTables = new Set<string>();

    comparisons.forEach((comparison) => {
      if (comparison.resultsTableName) {
        trackedComparisonTables.add(comparison.resultsTableName);
      }
    });

    const cleanupTargets = collectOrphanComparisonTables(updatedMetadata, trackedComparisonTables);
    const removalMap = new Map<DBSchema, Set<string>>();
    const orphanDropFailures: string[] = [];

    for (const target of cleanupTargets) {
      const outcome = await dropComparisonResultsTable(conn, target.tableName);

      if (outcome.ok) {
        let droppedSet = removalMap.get(target.schema);
        if (!droppedSet) {
          droppedSet = new Set<string>();
          removalMap.set(target.schema, droppedSet);
        }
        droppedSet.add(target.tableName);
      } else {
        console.error('Failed to drop orphaned comparison table:', target.tableName, outcome.error);
        orphanDropFailures.push(target.tableName);
      }
    }

    // Remove tables from metadata snapshots that were successfully dropped
    removalMap.forEach((tablesToRemove, schema) => {
      schema.objects = schema.objects.filter((object) => !tablesToRemove.has(object.name));
    });

    useAppStore.setState((state) => {
      const newMetadata = new Map(state.databaseMetadata);
      for (const [updatedDbName, updatedDbModel] of updatedMetadata) {
        newMetadata.set(updatedDbName, updatedDbModel);
      }
      return { databaseMetadata: newMetadata };
    });

    for (const dbName of dbNames) {
      invalidateRowCountCacheForDatabase(dbName);
    }

    if (orphanDropFailures.length > 0) {
      showWarning({
        title: 'Failed to clean comparison tables',
        message: `Some stored comparison tables could not be removed automatically: ${orphanDropFailures.join(
          ', ',
        )}. You can drop them manually from the PondPilot database.`,
      });
    }
  } catch (error) {
    // Show user-friendly error without exposing internal details
    showWarning({
      title: 'Refresh Failed',
      message:
        'Unable to refresh database information. Please check your connection and try again.',
    });
    // Log detailed error for debugging
    console.error('Database metadata refresh failed:', error);
  }
}
