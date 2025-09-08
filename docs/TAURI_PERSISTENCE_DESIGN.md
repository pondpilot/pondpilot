# Tauri Persistence Design

## Problem Statement

The Tauri implementation currently lacks persistence for application state. When users add files (CSV, Parquet, etc.), the following occurs:

1. **Initial state**: File data sources are created in memory, views are created in DuckDB, and the UI shows everything correctly
2. **After refresh/restart**: DuckDB views persist, but the app loses track of data sources, causing:
   - File Views section disappears
   - File entries disappear from sidebar
   - Views become "orphaned" (exist in DB but not tracked by app)

## Root Cause

- **Web version**: Uses IndexedDB to persist data sources, local entries, and SQL scripts
- **Tauri version**: No persistence layer implemented - all state is lost on refresh

## Architecture Decision: SQLite-based Persistence

After evaluating options (SQLite, File System, DuckDB Meta Tables), we've chosen SQLite because:

1. **Consistency**: Mirrors the IndexedDB approach used in the web version
2. **Reliability**: SQLite handles concurrent access, transactions, and corruption recovery
3. **Already available**: Tauri includes SQLite support, and `src-tauri/pondpilot.db` suggests it's already configured
4. **Maintainability**: Can reuse existing persistence patterns and interfaces

## Database Schema

```sql
-- Data sources table (mirrors IndexedDB structure)
CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('csv', 'json', 'parquet', 'xlsx-sheet', 'attached-db', 'remote-db')),
  file_source_id TEXT,
  view_name TEXT,
  sheet_name TEXT,
  db_name TEXT,
  db_type TEXT,
  url TEXT,
  connection_state TEXT,
  connection_error TEXT,
  attached_at INTEGER,
  comment TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Local file/folder entries
CREATE TABLE IF NOT EXISTS local_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'directory')),
  name TEXT NOT NULL,
  parent_id TEXT,
  user_added INTEGER DEFAULT 0,
  unique_alias TEXT,
  file_type TEXT,
  ext TEXT,
  file_path TEXT,     -- Tauri-specific: absolute path to file
  directory_path TEXT, -- Tauri-specific: absolute path to directory
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- SQL scripts
CREATE TABLE IF NOT EXISTS sql_scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_data_sources_file_source_id ON data_sources(file_source_id);
CREATE INDEX IF NOT EXISTS idx_local_entries_parent_id ON local_entries(parent_id);
```

## Implementation Architecture

### 1. Persistence Adapter Interface

Create a common interface that both IndexedDB and SQLite implementations can use:

```typescript
// src/store/persistence/types.ts
export interface PersistenceAdapter {
  // Basic CRUD operations
  get<T>(table: string, key: string): Promise<T | undefined>;
  put<T>(table: string, value: T, key?: string): Promise<void>;
  delete(table: string, key: string): Promise<void>;
  clear(table: string): Promise<void>;
  
  // Bulk operations
  getAll<T>(table: string): Promise<T[]>;
  putAll<T>(table: string, items: Array<{ key: string; value: T }>): Promise<void>;
  deleteAll(table: string, keys: string[]): Promise<void>;
  
  // Transaction support
  transaction<T>(
    tables: string[],
    mode: 'readonly' | 'readwrite',
    callback: () => Promise<T>
  ): Promise<T>;
}
```

### 2. SQLite Adapter Implementation

```typescript
// src/store/persistence/sqlite-adapter.ts
import { invoke } from '@tauri-apps/api/tauri';

export class SQLiteAdapter implements PersistenceAdapter {
  async get<T>(table: string, key: string): Promise<T | undefined> {
    return invoke('sqlite_get', { table, key });
  }
  
  async put<T>(table: string, value: T, key?: string): Promise<void> {
    await invoke('sqlite_put', { table, value, key });
  }
  
  // ... other methods
}
```

### 3. Tauri Backend Commands

```rust
// src-tauri/src/persistence.rs
use rusqlite::{Connection, Result};
use serde_json::Value;

#[tauri::command]
async fn sqlite_get(
    state: tauri::State<'_, DbState>,
    table: String,
    key: String
) -> Result<Option<Value>, String> {
    // Implementation
}

#[tauri::command]
async fn sqlite_put(
    state: tauri::State<'_, DbState>,
    table: String,
    value: Value,
    key: Option<String>
) -> Result<(), String> {
    // Implementation
}
```

### 4. Integration Points

Modify existing code to use the adapter:

1. **Store initialization** (`src/store/app-store.tsx`):
   ```typescript
   const adapter = isTauriEnvironment() 
     ? new SQLiteAdapter() 
     : new IndexedDBAdapter(idbConnection);
   ```

2. **Persist functions** (`src/controllers/file-system/persist.ts`):
   - Replace direct IndexedDB calls with adapter methods
   - Add Tauri-specific path handling

3. **Restore functions** (`src/store/restore.ts`):
   - Use adapter for reading persisted state
   - Handle Tauri file paths during restoration

## Migration Strategy

1. **Initial Release**: 
   - New Tauri users start with SQLite persistence
   - Existing data in DuckDB views is preserved

2. **Future Enhancement**:
   - Add migration tool to import orphaned views
   - Detect untracked views and offer to create data sources

## Benefits

1. **Feature Parity**: Tauri version will have same persistence capabilities as web
2. **User Experience**: Files and views persist across app restarts
3. **Code Reuse**: Minimal changes to existing persistence logic
4. **Maintainability**: Single persistence pattern for both platforms

## Implementation Timeline

1. Create SQLite adapter interface ✓
2. Implement Tauri backend SQLite commands
3. Create TypeScript SQLite adapter
4. Update persist.ts to use adapter
5. Update restore.ts to use adapter
6. Test persistence across restarts
7. Handle edge cases and migrations