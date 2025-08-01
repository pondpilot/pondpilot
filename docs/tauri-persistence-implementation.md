# Tauri Persistence Implementation

## Overview

This document describes the implementation of SQLite-based persistence for the Tauri desktop application, which provides feature parity with the web version's IndexedDB persistence.

## Problem

The Tauri version of PondPilot was not persisting data sources across application restarts. When a user added a CSV file and it appeared in the sidebar under "File Views", the data would disappear after refreshing or restarting the app. This was because:

1. Tauri doesn't have access to IndexedDB (web-only API)
2. Data sources were only stored in memory
3. File handles needed special handling for Tauri's file system access

## Solution

### Architecture

We implemented a persistence adapter pattern that allows the same persistence API to work with both IndexedDB (web) and SQLite (Tauri):

```
┌─────────────────┐     ┌──────────────────┐
│   Web Version   │     │  Tauri Version   │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│ IndexedDB       │     │ SQLite Adapter   │
│   Adapter       │     │                  │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │  PersistenceAdapter   │
         │      Interface        │
         └───────────────────────┘
```

### Key Components

1. **Rust Backend (`src-tauri/src/persistence.rs`)**
   - Manages SQLite database in app data directory as `pondpilot_sys.db`
   - Separate from DuckDB database (`pondpilot.db`)
   - Provides Tauri commands for CRUD operations
   - Tables: `data_sources`, `local_entries`, `sql_scripts`, `tabs`

2. **TypeScript Adapter (`src/store/persistence/sqlite-adapter.ts`)**
   - Implements `PersistenceAdapter` interface
   - Calls Tauri commands via `@tauri-apps/api/tauri`
   - Handles serialization/deserialization

3. **Unified Persistence API (`src/store/persistence/types.ts`)**
   - Common interface for both IndexedDB and SQLite
   - Methods: `get`, `put`, `delete`, `clear`, `getAll`

4. **File Handle Management**
   - Tauri stores file paths in SQLite as `tauriPath`
   - On restore, creates mock `FileSystemHandle` objects
   - Mock handles have `_tauriPath` property for Tauri-specific operations

### Implementation Details

#### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_entries (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sql_scripts (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tabs (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
);
```

#### Mock FileSystemHandle for Tauri

```typescript
// For files
{
  kind: 'file',
  name: 'file.csv',
  getFile: async () => {
    const fs = await import('@tauri-apps/api/fs');
    const contents = await fs.readBinaryFile(tauriPath);
    return new File([contents], name);
  },
  _tauriPath: '/path/to/file.csv'
}
```

#### Persistence Flow

1. **Saving Data**:
   - User adds file → creates `LocalEntry` with `tauriPath`
   - Persistence adapter serializes to JSON
   - Tauri command saves to SQLite

2. **Restoring Data**:
   - App startup calls `initializePersistence`
   - For Tauri: reads from SQLite, creates mock handles
   - For Web: reads from IndexedDB (existing behavior)

### Files Modified

1. **Rust Backend**:
   - `src-tauri/src/persistence.rs` - SQLite implementation
   - `src-tauri/src/main.rs` - Register persistence commands

2. **TypeScript Persistence**:
   - `src/store/persistence/types.ts` - Common interface
   - `src/store/persistence/sqlite-adapter.ts` - SQLite adapter
   - `src/store/persistence/indexeddb-adapter.ts` - IndexedDB adapter
   - `src/store/persistence/index.ts` - Factory function

3. **Core Updates**:
   - `src/store/persistence-init.ts` - Unified initialization
   - `src/controllers/file-system/persist.ts` - Use adapters
   - `src/features/app-context/hooks/use-init-application.tsx` - Use new init

### Benefits

1. **Feature Parity**: Tauri and Web versions now behave identically
2. **Maintainability**: Single persistence API for both platforms
3. **Type Safety**: TypeScript interfaces ensure consistency
4. **Extensibility**: Easy to add new persistence backends

### Database Files

The Tauri version uses two separate database files in the app data directory:
- `pondpilot.db` - DuckDB database for data processing and queries
- `pondpilot_sys.db` - SQLite database for system persistence (data sources, tabs, etc.)

Both files are stored at: `/Users/alex/Library/Application Support/io.pondpilot.desktop/`

### Future Improvements

1. Store content view state (active tab, tab order) in SQLite
2. Add data migration utilities
3. Implement backup/restore functionality
4. Add persistence for user preferences