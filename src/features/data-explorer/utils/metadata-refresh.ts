import { showWarning } from '@components/app-notifications';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { useAppStore } from '@store/app-store';

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
export async function refreshDatabaseMetadata(
  conn: ConnectionPool,
  dbNames: string[],
): Promise<void> {
  try {
    const updatedMetadata = await getDatabaseModel(conn, dbNames);
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);

    // Update the database metadata
    for (const [updatedDbName, updatedDbModel] of updatedMetadata) {
      newMetadata.set(updatedDbName, updatedDbModel);
    }

    useAppStore.setState({ databaseMetadata: newMetadata });
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
