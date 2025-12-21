/**
 * Centralized LRU (Least Recently Used) tracking service.
 * Re-exports tracking functions from table-access.ts for convenience.
 *
 * All access times are now stored in separate maps (not in the data models),
 * providing better separation of concerns and improved maintainability.
 */

export {
  updateDataSourceAccessTime as updateDataSourceLastUsed,
  updateScriptAccessTime as updateSQLScriptLastUsed,
  updateTableAccessTime,
} from './table-access';
