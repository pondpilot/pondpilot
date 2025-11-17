# Unified File Handle Migration Guide

This guide explains how to migrate from the old `_tauriPath` pattern to the new unified file handle system.

## Overview

The unified file handle system provides a single abstraction for working with files and directories across both web (File System Access API) and Tauri environments. This eliminates the need for platform-specific `_tauriPath` checks scattered throughout the codebase.

## Key Changes

### Before (Old Pattern)
```typescript
// Accessing Tauri paths
const path = (handle as any)._tauriPath;
filePath: (handle as any)._tauriPath,

// Creating mock handles
return {
  kind: 'file',
  name: file.name,
  getFile: async () => { /* ... */ },
  _tauriPath: file.path,
} as any;
```

### After (New Pattern)
```typescript
import { createUnifiedFileHandle, convertLegacyHandle } from '@utils/file-handle';

// Convert legacy handles
const unifiedHandle = convertLegacyHandle(handle);
const path = unifiedHandle?.getPath();

// Create new handles
const handle = createUnifiedFileHandle(path, fileName);
```

## API Reference

### Types

- `UnifiedFileHandle` - Abstraction for file handles
- `UnifiedDirectoryHandle` - Abstraction for directory handles
- `UnifiedHandle` - Union of file and directory handles

### Factory Functions

- `createUnifiedFileHandle(handleOrPath, fileName?)` - Creates a file handle
- `createUnifiedDirectoryHandle(handleOrPath, dirName?)` - Creates a directory handle
- `convertLegacyHandle(handle)` - Converts old-style handles to unified handles

### Handle Methods

All unified handles provide:
- `getPath()` - Returns the file system path (Tauri) or null (web)
- `getNativeHandle()` - Returns the underlying FileSystemHandle (web) or null (Tauri)
- `queryPermission()` - Check permission status
- `requestPermission()` - Request permission
- `isSameEntry(other)` - Compare handles

## Migration Steps

1. **Import the new utilities:**
   ```typescript
   import { createUnifiedFileHandle, convertLegacyHandle } from '@utils/file-handle';
   ```

2. **Replace `_tauriPath` access:**
   ```typescript
   // Old
   const path = (handle as any)._tauriPath;
   
   // New
   const unifiedHandle = convertLegacyHandle(handle);
   const path = unifiedHandle?.getPath();
   ```

3. **Create handles properly:**
   ```typescript
   // Old
   const mockHandle = {
     kind: 'file',
     name: file.name,
     _tauriPath: file.path,
   } as any;
   
   // New
   const unifiedHandle = createUnifiedFileHandle(file.path, file.name);
   ```

4. **Update persistence logic:**
   The persistence layer now uses `convertLegacyHandle` internally to extract paths.

## Benefits

1. **Type Safety** - No more `any` casting
2. **Maintainability** - Platform logic centralized in one place
3. **Extensibility** - Easy to add new platforms or features
4. **Testability** - Each implementation can be tested independently

## Backward Compatibility

The system maintains backward compatibility by:
- Supporting legacy handles with `_tauriPath` through `convertLegacyHandle`
- Keeping the existing `_tauriPath` property on compatibility wrappers
- Not breaking existing LocalFile/LocalFolder structures

## Future Improvements

- Remove `_tauriPath` entirely once all code is migrated
- Add support for write operations in unified handles
- Implement proper directory traversal for Tauri handles