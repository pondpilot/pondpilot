/**
 * Utility functions for tracking access times across different entity types.
 * Provides a unified interface for LRU (Least Recently Used) tracking
 * for data sources, SQL scripts, and database tables/views.
 */

import { PersistentDataSourceId } from '@models/data-source';
import {
  DATA_SOURCE_ACCESS_TIME_TABLE_NAME,
  SCRIPT_ACCESS_TIME_TABLE_NAME,
  TABLE_ACCESS_TIME_TABLE_NAME,
} from '@models/persisted-store';
import { SQLScriptId } from '@models/sql-script';
import { useAppStore } from '@store/app-store';
import { lastUsedWriter } from '@utils/idb-debounce';

/**
 * Generates a unique key for a database table or view.
 * Format: JSON array serialization to prevent collisions
 *
 * This format ensures unique identification even when:
 * - Same table name exists in different databases
 * - Same table name exists in different schemas
 * - Identifiers contain dots (valid for quoted identifiers)
 *
 * @param dbName - Database name
 * @param schemaName - Schema name
 * @param tableName - Table or view name
 * @returns Unique key string
 */
export function makeTableAccessKey(dbName: string, schemaName: string, tableName: string): string {
  return JSON.stringify([dbName, schemaName, tableName]);
}

/**
 * Parses a table access key back into its components.
 *
 * @param key - Table access key (JSON array format)
 * @returns Tuple with [dbName, schemaName, tableName], or null if invalid format
 */
export function parseTableAccessKey(key: string): [string, string, string] | null {
  try {
    const parsed = JSON.parse(key);
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every((item) => typeof item === 'string')
    ) {
      return parsed as [string, string, string];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Gets the last access time for a specific table/view.
 * Returns 0 if the table has never been accessed.
 *
 * @param dbName - Database name
 * @param schemaName - Schema name
 * @param tableName - Table or view name
 * @returns Last access timestamp, or 0 if never accessed
 */
export function getTableAccessTime(dbName: string, schemaName: string, tableName: string): number {
  const key = makeTableAccessKey(dbName, schemaName, tableName);
  const { tableAccessTimes } = useAppStore.getState();
  return tableAccessTimes.get(key) ?? 0;
}

/**
 * Updates the last access time for a specific table/view.
 * Automatically persists to IndexedDB using debounced writer.
 *
 * @param dbName - Database name
 * @param schemaName - Schema name
 * @param tableName - Table or view name
 */
export function updateTableAccessTime(dbName: string, schemaName: string, tableName: string): void {
  // Input validation
  if (!dbName || typeof dbName !== 'string') {
    console.warn('updateTableAccessTime: Invalid dbName provided');
    return;
  }
  if (!schemaName || typeof schemaName !== 'string') {
    console.warn('updateTableAccessTime: Invalid schemaName provided');
    return;
  }
  if (!tableName || typeof tableName !== 'string') {
    console.warn('updateTableAccessTime: Invalid tableName provided');
    return;
  }

  const key = makeTableAccessKey(dbName, schemaName, tableName);
  const now = Date.now();

  // Update in-memory state
  const { tableAccessTimes, _iDbConn } = useAppStore.getState();
  const newTableAccessTimes = new Map(tableAccessTimes);
  newTableAccessTimes.set(key, now);

  useAppStore.setState(
    { tableAccessTimes: newTableAccessTimes },
    undefined,
    'updateTableAccessTime',
  );

  // Persist to IndexedDB (debounced)
  if (_iDbConn) {
    lastUsedWriter.schedulePut(TABLE_ACCESS_TIME_TABLE_NAME, now, key, _iDbConn);
  }
}

// ========== Data Source Access Tracking ==========

/**
 * Updates the last access time for a data source.
 * Automatically persists to IndexedDB using debounced writer.
 *
 * @param dataSourceId - The ID of the data source to update
 */
export function updateDataSourceAccessTime(dataSourceId: PersistentDataSourceId): void {
  // Input validation
  if (!dataSourceId || typeof dataSourceId !== 'string') {
    console.warn('updateDataSourceAccessTime: Invalid dataSourceId provided');
    return;
  }

  const now = Date.now();

  // Update in-memory state
  const { dataSourceAccessTimes, _iDbConn } = useAppStore.getState();
  const newAccessTimes = new Map(dataSourceAccessTimes);
  newAccessTimes.set(dataSourceId, now);

  useAppStore.setState(
    { dataSourceAccessTimes: newAccessTimes },
    undefined,
    'updateDataSourceAccessTime',
  );

  // Persist to IndexedDB (debounced)
  if (_iDbConn) {
    lastUsedWriter.schedulePut(DATA_SOURCE_ACCESS_TIME_TABLE_NAME, now, dataSourceId, _iDbConn);
  }
}

/**
 * Gets the last access time for a data source.
 * Returns 0 if the data source has never been accessed.
 *
 * @param dataSourceId - The ID of the data source
 * @returns Last access timestamp, or 0 if never accessed
 */
export function getDataSourceAccessTime(dataSourceId: PersistentDataSourceId): number {
  const { dataSourceAccessTimes } = useAppStore.getState();
  return dataSourceAccessTimes.get(dataSourceId) ?? 0;
}

// ========== SQL Script Access Tracking ==========

/**
 * Updates the last access time for a SQL script.
 * Automatically persists to IndexedDB using debounced writer.
 *
 * @param scriptId - The ID of the SQL script to update
 */
export function updateScriptAccessTime(scriptId: SQLScriptId): void {
  // Input validation
  if (!scriptId || typeof scriptId !== 'string') {
    console.warn('updateScriptAccessTime: Invalid scriptId provided');
    return;
  }

  const now = Date.now();

  // Update in-memory state
  const { scriptAccessTimes, _iDbConn } = useAppStore.getState();
  const newAccessTimes = new Map(scriptAccessTimes);
  newAccessTimes.set(scriptId, now);

  useAppStore.setState({ scriptAccessTimes: newAccessTimes }, undefined, 'updateScriptAccessTime');

  // Persist to IndexedDB (debounced)
  if (_iDbConn) {
    lastUsedWriter.schedulePut(SCRIPT_ACCESS_TIME_TABLE_NAME, now, scriptId, _iDbConn);
  }
}

/**
 * Gets the last access time for a SQL script.
 * Returns 0 if the script has never been accessed.
 *
 * @param scriptId - The ID of the SQL script
 * @returns Last access timestamp, or 0 if never accessed
 */
export function getScriptAccessTime(scriptId: SQLScriptId): number {
  const { scriptAccessTimes } = useAppStore.getState();
  return scriptAccessTimes.get(scriptId) ?? 0;
}
