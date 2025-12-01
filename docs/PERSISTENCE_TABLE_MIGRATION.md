# Persistence Table Naming Migration

## Overview
This document describes the migration plan for standardizing persistence table names across the PondPilot application.

## Current State
- **Frontend (IndexedDB)**: Uses hyphenated names (e.g., `data-source`, `local-entry`)
- **Backend (SQLite/Tauri)**: Uses hyphenated names to match frontend
- **Issue**: Hyphenated names are non-standard for SQL and can cause issues with some tools

## Target State
- **All systems**: Use underscored names (e.g., `data_sources`, `local_entries`)
- **Benefits**: 
  - SQL standard compliance
  - Better tooling compatibility
  - Consistent with database naming conventions

## Migration Plan

### Phase 1: Add Constants (✅ Completed)
- Created `src/models/persistence-tables.ts` with both legacy and new names
- Updated `persisted-store.ts` to use constants
- Maintains backward compatibility

### Phase 2: Backend Support (Next)
1. Update Rust persistence to support both table names
2. Add migration logic to copy data from old tables to new
3. Keep both tables in sync during transition period

### Phase 3: Frontend Migration
1. Update IndexedDB schema to use new table names
2. Add migration logic in `store/persistence-init.ts`
3. Test thoroughly with existing data

### Phase 4: Cleanup
1. Remove support for legacy table names
2. Drop old tables after verification
3. Update all documentation

## Table Name Mapping

| Old Name (Legacy) | New Name (Standard) | Purpose |
|-------------------|---------------------|---------|
| `data-source`     | `data_sources`      | Data source configurations |
| `local-entry`     | `local_entries`     | Local file/folder entries |
| `sql-script`      | `sql_scripts`       | SQL script storage |
| `tab`             | `tabs`              | Tab state persistence |
| `content-view`    | `content_view`      | UI state (active tab, etc.) |

## Implementation Notes

1. The constants are defined in `src/models/persistence-tables.ts`
2. Legacy names are kept for backward compatibility
3. Migration should be transparent to users
4. Data integrity must be maintained throughout

## Testing Requirements

1. Test migration with existing user data
2. Verify no data loss during migration
3. Test rollback scenarios
4. Performance testing with large datasets

## Rollback Plan

If issues arise:
1. Keep legacy table support indefinitely
2. Add feature flag to control which tables to use
3. Provide manual migration tools if needed