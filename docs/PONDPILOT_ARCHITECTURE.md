# PondPilot Architecture: Two-Headed Web/Desktop Application

## Table of Contents
1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Database Engine Abstraction](#database-engine-abstraction)
4. [Platform Detection and Engine Selection](#platform-detection-and-engine-selection)
5. [File System Abstraction](#file-system-abstraction)
6. [Persistence Layer](#persistence-layer)
7. [Communication Patterns](#communication-patterns)
8. [Build and Deployment](#build-and-deployment)
9. [Developer Guide](#developer-guide)

## Overview

PondPilot is a blazing-fast data exploration tool that runs identically as a web application and a native desktop application. The architecture uses a **single codebase** with platform-specific adapters, allowing users to choose between:

- **Web Version**: Runs entirely in the browser using DuckDB-WASM
- **Desktop Version**: Native performance via Tauri with Rust-based DuckDB

### Key Architectural Principles

1. **Write Once, Run Anywhere**: Single React/TypeScript codebase
2. **Platform-Specific Optimization**: Native performance where available
3. **Graceful Degradation**: Features adapt to platform capabilities
4. **Zero Backend**: All processing happens on the user's device

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PondPilot Application                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          React UI Layer                              │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐  │   │
│  │  │ SQL Editor  │  │ Data Explorer│  │ Query Result│  │ Settings │  │   │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  └──────────┘  │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│                    ┌─────────────▼─────────────────┐                        │
│                    │   Platform Detection Layer    │                        │
│                    │  if (window.__TAURI__) {...} │                        │
│                    └───────┬─────────────┬─────────┘                        │
│                            │             │                                  │
│                  Web Path  │             │  Desktop Path                    │
│                            │             │                                  │
│  ┌─────────────────────────▼─┐       ┌──▼──────────────────────────────┐   │
│  │    Browser Environment    │       │      Tauri Environment          │   │
│  ├───────────────────────────┤       ├─────────────────────────────────┤   │
│  │ ┌─────────────────────┐   │       │ ┌─────────────────────────────┐ │   │
│  │ │  DuckDB WASM Engine │   │       │ │  DuckDB Tauri Engine      │ │   │
│  │ ├─────────────────────┤   │       │ ├─────────────────────────────┤ │   │
│  │ │ • Web Worker       │   │       │ │ • Rust IPC Bridge         │ │   │
│  │ │ • WASM Binary      │   │       │ │ • Native DuckDB           │ │   │
│  │ │ • IndexedDB        │   │       │ │ • SQLite Persistence      │ │   │
│  │ │ • File System API  │   │       │ │ • Native File Access      │ │   │
│  │ └─────────────────────┘   │       │ └─────────────────────────────┘ │   │
│  └───────────────────────────┘       └─────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Database Engine Abstraction

The core of PondPilot's two-headed architecture is the database engine abstraction layer. This allows the same UI code to work with different database implementations.

### Database Engine Interface

```typescript
// src/engines/types.ts
export interface DatabaseEngine {
  // Lifecycle Management
  initialize(config: EngineConfig): Promise<void>;
  shutdown(): Promise<void>;
  isReady(): boolean;
  
  // Query Operations
  execute(sql: string, params?: any[]): Promise<QueryResult>;
  stream(sql: string, params?: any[]): AsyncIterator<any>;
  prepare(sql: string): Promise<PreparedStatement>;
  
  // File Management
  registerFile(options: FileRegistration): Promise<void>;
  dropFile(name: string): Promise<void>;
  listFiles(): Promise<FileInfo[]>;
  
  // Metadata
  getCatalog(): Promise<CatalogInfo>;
  getTables(database: string): Promise<TableInfo[]>;
  getColumns(database: string, table: string): Promise<ColumnInfo[]>;
  
  // Capabilities
  getCapabilities(): EngineCapabilities;
}
```

### Engine Implementation Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    DatabaseEngineFactory                         │
├──────────────────────────────────────────────────────────────────┤
│ + createEngine(config: EngineConfig): DatabaseEngine             │
│ + detectOptimalEngine(): EngineConfig                            │
│                                                                  │
│ detectOptimalEngine() {                                          │
│   if (window.__TAURI__) {                                        │
│     return { type: 'duckdb-tauri', ... }                         │
│   }                                                              │
│   return { type: 'duckdb-wasm', ... }                            │
│ }                                                                │
└────────────────────────────┬─────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ DuckDBWasm    │   │ DuckDBTauri   │   │ Future SQLite │
│ Engine        │   │ Engine        │   │ Engine        │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ Web Worker    │   │ Tauri IPC     │   │ WASM/Native   │
│ WASM Binary   │   │ Rust Backend  │   │ Lightweight   │
│ Browser APIs  │   │ Native APIs   │   │ Mobile Ready  │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Platform Detection and Engine Selection

The system automatically detects the runtime environment and selects the appropriate engine:

```typescript
// src/engines/database-engine-factory.ts
export class DatabaseEngineFactory {
  static detectOptimalEngine(): EngineConfig {
    // Check if running in Tauri
    if (typeof window !== 'undefined' && window.__TAURI__) {
      return {
        type: 'duckdb-tauri',
        storageType: 'persistent',
        storagePath: '~/Library/Application Support/io.pondpilot.desktop/'
      };
    }
    
    // Check browser capabilities
    const hasOPFS = 'storage' in navigator && 'getDirectory' in navigator.storage;
    const hasFileAPI = 'showOpenFilePicker' in window;
    
    return {
      type: 'duckdb-wasm',
      storageType: hasOPFS ? 'persistent' : 'memory',
      features: {
        directFileAccess: hasFileAPI,
        persistence: hasOPFS
      }
    };
  }
}
```

## File System Abstraction

PondPilot abstracts file operations to work seamlessly across platforms:

```
┌─────────────────────────────────────────────────────────────────┐
│                      File System Layer                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  IFilePicker Interface                    │  │
│  │  + pickFiles(extensions, description): Promise<Result>   │  │
│  │  + pickFolder(): Promise<Result>                         │  │
│  └────────────────────┬─────────────────┬───────────────────┘  │
│                       │                 │                       │
│         Web Browser   │                 │   Tauri Desktop      │
│                       ▼                 ▼                       │
│  ┌─────────────────────────┐   ┌─────────────────────────┐    │
│  │    WebFilePicker        │   │    TauriFilePicker      │    │
│  ├─────────────────────────┤   ├─────────────────────────┤    │
│  │ File System Access API  │   │ Native Dialog (Rust)    │    │
│  │ ┌───────────────────┐   │   │ ┌───────────────────┐   │    │
│  │ │ if supported:     │   │   │ │ tauri::api::     │   │    │
│  │ │   showOpenFile    │   │   │ │   dialog::       │   │    │
│  │ │   Picker()       │   │   │ │   FileDialog     │   │    │
│  │ ├───────────────────┤   │   │ ├───────────────────┤   │    │
│  │ │ else:            │   │   │ │ Returns:         │   │    │
│  │ │   <input         │   │   │ │   - File paths   │   │    │
│  │ │    type="file">  │   │   │ │   - Mock handles │   │    │
│  │ └───────────────────┘   │   │ └───────────────────┘   │    │
│  └─────────────────────────┘   └─────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### File Handle Compatibility

The Tauri implementation provides mock handles for compatibility:

```typescript
// Web version expects FileSystemFileHandle
interface FileSystemFileHandle {
  getFile(): Promise<File>;
  name: string;
}

// Tauri provides compatible mock
class TauriFileHandle implements FileSystemFileHandle {
  constructor(private filePath: string) {}
  
  async getFile(): Promise<File> {
    // Read file from disk via Tauri
    const contents = await invoke('read_file', { path: this.filePath });
    return new File([contents], this.name);
  }
}
```

## Persistence Layer

Both platforms use different storage mechanisms but share the same interface:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Persistence Layer                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               PersistenceAdapter Interface                │  │
│  │  + get(table, key): Promise<T>                           │  │
│  │  + put(table, value, key?): Promise<void>                │  │
│  │  + getAll(table): Promise<T[]>                           │  │
│  └────────────────────┬─────────────────┬───────────────────┘  │
│                       │                 │                       │
│         Web Browser   │                 │   Tauri Desktop      │
│                       ▼                 ▼                       │
│  ┌─────────────────────────┐   ┌─────────────────────────┐    │
│  │   IndexedDBAdapter      │   │    SQLiteAdapter        │    │
│  ├─────────────────────────┤   ├─────────────────────────┤    │
│  │ Browser Storage:        │   │ Native Storage:         │    │
│  │ ┌───────────────────┐   │   │ ┌───────────────────┐   │    │
│  │ │ IndexedDB        │   │   │ │ SQLite Database  │   │    │
│  │ │ - data-source    │   │   │ │ - data_sources   │   │    │
│  │ │ - local-entry    │   │   │ │ - local_entries  │   │    │
│  │ │ - sql-script     │   │   │ │ - sql_scripts    │   │    │
│  │ │ - tab            │   │   │ │ - tabs           │   │    │
│  │ └───────────────────┘   │   │ └───────────────────┘   │    │
│  └─────────────────────────┘   └─────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Locations

```
Web Browser:
└── IndexedDB (browser storage)
    └── pondpilot-db
        ├── data-source
        ├── local-entry
        ├── sql-script
        └── tab

Tauri Desktop:
└── ~/Library/Application Support/io.pondpilot.desktop/
    ├── pondpilot.db        # DuckDB data
    └── pondpilot_state.db  # SQLite app state
        ├── data_sources
        ├── local_entries
        ├── sql_scripts
        └── tabs
```

## Communication Patterns

### Web Browser: Direct JavaScript Calls

```
┌──────────────┐     Direct      ┌──────────────┐
│   React UI   │ ─────────────► │ DuckDB WASM  │
│              │ ◄───────────── │  (Worker)    │
└──────────────┘     Promise     └──────────────┘
```

### Tauri Desktop: IPC Bridge

```
┌──────────────┐      IPC        ┌──────────────┐     FFI      ┌──────────────┐
│   React UI   │ ─────────────► │ Rust Backend │ ───────────► │Native DuckDB │
│ (JavaScript) │ ◄───────────── │   (Tauri)    │ ◄─────────── │   (C++)      │
└──────────────┘    Promise      └──────────────┘    Result     └──────────────┘

IPC Communication:
1. UI calls: invoke('execute_query', { sql, params })
2. Rust receives command via Tauri
3. Rust calls native DuckDB
4. Results serialized back to UI
```

### Streaming Data Pattern

Both platforms support streaming for large datasets:

```
Web Browser:
┌─────────┐     AsyncIterator    ┌─────────┐
│   UI    │ ◄────────────────── │  WASM   │
└─────────┘                      └─────────┘

Tauri Desktop:
┌─────────┐     Event Stream     ┌─────────┐     Chunks      ┌─────────┐
│   UI    │ ◄────────────────── │  Rust   │ ◄──────────── │ DuckDB  │
└─────────┘   stream-{id}-data   └─────────┘                └─────────┘
              stream-{id}-end
```

## Build and Deployment

### Single Codebase, Multiple Targets

```
                    ┌─────────────────────┐
                    │   Source Code       │
                    │  TypeScript/React   │
                    └──────────┬──────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │  Web Build   │ │ Tauri Build  │ │Future Mobile │
        ├──────────────┤ ├──────────────┤ ├──────────────┤
        │ yarn build   │ │ yarn tauri:  │ │ Capacitor/   │
        │              │ │    build     │ │ React Native │
        ├──────────────┤ ├──────────────┤ ├──────────────┤
        │ Output:      │ │ Output:      │ │ Output:      │
        │ - index.html │ │ - .app (Mac) │ │ - .apk       │
        │ - .js/.css   │ │ - .exe (Win) │ │ - .ipa       │
        │ - assets/    │ │ - .deb/.rpm  │ │              │
        └──────────────┘ └──────────────┘ └──────────────┘
                │              │
                ▼              ▼
         ┌────────────┐ ┌────────────┐
         │  Web Host  │ │   Direct   │
         │  (Vercel)  │ │  Install   │
         └────────────┘ └────────────┘
```

### Build Commands

```bash
# Development
yarn dev          # Web development server
yarn tauri:dev    # Desktop development

# Production
yarn build        # Web production build
yarn tauri:build  # Desktop installers

# Testing
yarn test         # Run all tests
yarn test:unit    # Unit tests only
yarn playwright   # E2E tests
```

## Developer Guide

### Adding a New Feature

When adding features, consider both platforms:

```typescript
// ❌ Bad: Platform-specific code in components
function MyComponent() {
  if (window.__TAURI__) {
    // Tauri-specific code
  } else {
    // Web-specific code
  }
}

// ✅ Good: Use abstraction layer
function MyComponent() {
  const { pickFiles } = useFilePicker(); // Returns platform-appropriate implementation
  const files = await pickFiles();        // Same API, different implementations
}
```

### Creating Platform Adapters

1. Define the interface:
```typescript
export interface MyFeature {
  doSomething(): Promise<Result>;
}
```

2. Create implementations:
```typescript
// Web implementation
export class WebMyFeature implements MyFeature {
  async doSomething() {
    // Browser-specific code
  }
}

// Tauri implementation  
export class TauriMyFeature implements MyFeature {
  async doSomething() {
    // Tauri-specific code
  }
}
```

3. Use factory pattern:
```typescript
export function createMyFeature(): MyFeature {
  if (window.__TAURI__) {
    return new TauriMyFeature();
  }
  return new WebMyFeature();
}
```

### Performance Considerations

```
┌─────────────────────────────────────────────────────────────┐
│                  Performance Characteristics                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Web Browser:                    Tauri Desktop:            │
│  ┌─────────────────────┐        ┌─────────────────────┐   │
│  │ Query Speed: 1x     │        │ Query Speed: 2-5x  │   │
│  │ Memory: Browser     │        │ Memory: Native      │   │
│  │ File Size: 2GB max  │        │ File Size: No limit │   │
│  │ Extensions: Limited │        │ Extensions: All     │   │
│  │ Threads: Limited    │        │ Threads: Full       │   │
│  └─────────────────────┘        └─────────────────────┘   │
│                                                             │
│  Choose Web When:                Choose Desktop When:       │
│  • Accessibility is key          • Performance matters      │
│  • No installation needed        • Large datasets (>2GB)    │
│  • Sharing via URL               • Complex analytics        │
│  • Chrome-only is OK             • Native integrations      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Testing Across Platforms

```bash
# Run tests for both platforms
yarn test:web      # Browser environment tests
yarn test:tauri    # Desktop environment tests

# Platform-specific mocking
beforeEach(() => {
  if (testEnvironment === 'tauri') {
    window.__TAURI__ = mockTauriAPI;
  }
});
```

## Summary

PondPilot's two-headed architecture provides:

1. **Single Codebase**: Maintain one codebase for multiple platforms
2. **Platform Optimization**: Native performance where available
3. **Consistent UX**: Same interface across all platforms
4. **Progressive Enhancement**: Features adapt to platform capabilities
5. **Future-Proof**: Easy to add new platforms (mobile, cloud)

The abstraction layers ensure that platform-specific code is isolated, making the codebase maintainable and extensible. Whether running in a browser or as a desktop app, users get the best possible experience for their platform.