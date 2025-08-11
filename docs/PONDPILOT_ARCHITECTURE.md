# PondPilot Architecture: Two-Headed Web/Desktop Application

## Table of Contents
1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Database Engine Abstraction](#database-engine-abstraction)
4. [Platform Detection and Engine Selection](#platform-detection-and-engine-selection)
5. [File System Abstraction](#file-system-abstraction)
6. [Persistence Layer](#persistence-layer)
7. [Communication Patterns](#communication-patterns)
8. [Streaming Architecture](#streaming-architecture)
9. [Connection Pool Management](#connection-pool-management)
10. [Build and Deployment](#build-and-deployment)
11. [Developer Guide](#developer-guide)

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
│  │                          React UI Layer                             │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐   │   │
│  │  │ SQL Editor  │  │ Data Explorer│  │ Query Result│  │ Settings │   │   │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  └──────────┘   │   │
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
│  │ │  DuckDB WASM Engine │   │       │ │  DuckDB Tauri Engine        │ │   │
│  │ ├─────────────────────┤   │       │ ├─────────────────────────────┤ │   │
│  │ │ • Web Worker        │   │       │ │ • Rust IPC Bridge           │ │   │
│  │ │ • WASM Binary       │   │       │ │ • Native DuckDB             │ │   │
│  │ │ • IndexedDB         │   │       │ │ • SQLite Persistence        │ │   │
│  │ │ • File System API   │   │       │ │ • Native File Access        │ │   │
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
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
        ┌───────────────┐       ┌───────────────┐
        │ DuckDBWasm    │       │ DuckDBTauri   │
        │ Engine        │       │ Engine        │
        ├───────────────┤       ├───────────────┤
        │ Web Worker    │       │ Tauri IPC     │
        │ WASM Binary   │       │ Rust Backend  │
        │ Browser APIs  │       │ Native APIs   │
        └───────────────┘       └───────────────┘
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
│  │  + delete(table, key): Promise<void>                     │  │
│  │  + clear(table): Promise<void>                           │  │
│  │  + getAll(table): Promise<T[]>                           │  │
│  │  + putAll(table, items): Promise<void>                   │  │
│  │  + deleteAll(table, keys): Promise<void>                 │  │
│  └────────────────────┬─────────────────┬───────────────────┘  │
│                       │                 │                       │
│         Web Browser   │                 │   Tauri Desktop      │
│                       ▼                 ▼                       │
│  ┌─────────────────────────┐   ┌─────────────────────────┐    │
│  │   IndexedDBAdapter      │   │    SQLiteAdapter        │    │
│  ├─────────────────────────┤   ├─────────────────────────┤    │
│  │ Browser Storage:        │   │ Native Storage:         │    │
│  │ ┌───────────────────┐   │   │ ┌───────────────────┐   │    │
│  │ │ IndexedDB        │   │   │ │ SQLite via IPC   │   │    │
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
┌─────────┐     Event Stream     ┌─────────┐     Arrow IPC    ┌─────────┐
│   UI    │ ◄────────────────── │  Rust   │ ◄──────────── │ DuckDB  │
└─────────┘   stream-{id}-schema └─────────┘                └─────────┘
              stream-{id}-batch
              stream-{id}-complete
```

## Streaming Architecture

### Overview

Streaming is critical for handling large datasets without overwhelming memory. The Tauri implementation uses Apache Arrow IPC format for efficient data transfer with a unified pool for connection management.

### Streaming Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Streaming Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  React UI                                                       │
│  ┌──────────────┐                                               │
│  │ stream_query │ ─────► Tauri Command                          │
│  └──────────────┘        ┌─────────────────────────────┐       │
│                          │ stream_query()               │       │
│                          ├─────────────────────────────┤       │
│                          │ 1. Register stream          │       │
│                          │ 2. Get pooled connection    │       │
│                          │ 3. Acquire streaming permit │       │
│                          └──────────┬──────────────────┘       │
│                                     │                           │
│                          ┌──────────▼──────────────────┐       │
│                          │ Blocking Task Thread        │       │
│                          ├─────────────────────────────┤       │
│                          │ • Execute DuckDB query      │       │
│                          │ • Stream Arrow batches      │       │
│                          │ • Convert to Arrow IPC      │       │
│                          │ • Base64 encode            │       │
│                          │ • Send via channel          │       │
│                          └──────────┬──────────────────┘       │
│                                     │                           │
│                          ┌──────────▼──────────────────┐       │
│                          │ Event Emitter               │       │
│                          ├─────────────────────────────┤       │
│                          │ stream-{id}-schema          │       │
│                          │ stream-{id}-batch           │       │
│                          │ stream-{id}-complete        │       │
│                          └─────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **ArrowStreamingExecutor**: Manages streaming query execution
2. **Unified Pool**: Provides connection permits for streaming
3. **Cancellation Tokens**: Allows stream cancellation mid-execution
4. **Arrow IPC Format**: Binary format for efficient data transfer

### Streaming Optimizations

1. **Early Termination**: Only sends first batch (2048 rows) initially
2. **Cancellation Support**: Streams can be cancelled mid-execution
3. **Connection Return**: Connections are properly returned to pool
4. **Memory Efficiency**: Uses Arrow columnar format

### Web vs Desktop Streaming

```
Web (WASM):
• Single connection model
• In-memory operations
• JavaScript event loop handles queuing
• No connection pool needed

Desktop (Tauri):
• Multiple connections from pool
• File-based operations (can be slow)
• Explicit connection management
• Semaphore limits concurrency
```

## Connection Pool Management

### Architecture

The Tauri backend uses a **Unified Connection Pool** with a permit-based system to manage DuckDB connections efficiently:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Unified Pool Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    UnifiedPool                           │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ • permits: Semaphore(max_connections)                    │   │
│  │ • max_connections: 10                                    │   │
│  │ • min_connections: 2                                     │   │
│  │ • acquire_timeout: 5s                                    │   │
│  │ • resource_limits: (memory, threads)                     │   │
│  └────────────────┬────────────────────────────────────────┘   │
│                   │                                             │
│         ┌─────────┴──────────┬──────────────┐                  │
│         ▼                    ▼              ▼                  │
│  ┌──────────────┐    ┌──────────────┐ ┌──────────────┐        │
│  │ acquire_     │    │ Connection   │ │ Resource     │        │
│  │ permit()     │    │ Permit       │ │ Manager      │        │
│  ├──────────────┤    ├──────────────┤ ├──────────────┤        │
│  │ • Get permit │    │ • Create     │ │ • Memory     │        │
│  │ • Return     │    │   connection │ │   limits     │        │
│  │   permit     │    │   in thread  │ │ • Thread     │        │
│  │ • Timeout    │    │ • Configure  │ │   limits     │        │
│  └──────────────┘    └──────────────┘ └──────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Connection Lifecycle

1. **Permit Acquisition**: Thread acquires a semaphore permit
2. **Thread-Local Creation**: Connection created in the executing thread
3. **Configuration**: Apply memory limits and thread settings
4. **Use & Dispose**: Connection used and then dropped (not reused)

### Thread Safety

**CRITICAL**: DuckDB connections are NOT thread-safe. Each connection must be created and used within the same thread. The unified pool ensures this by:
1. Creating connections in the thread where they will be used
2. Never sharing connections between threads
3. Using permits to control concurrent access
4. Dropping connections after use rather than reusing them

### Key Design Decisions

1. **Permit-based System**: Semaphore permits control connection creation
2. **Thread-Local Connections**: Each connection created in its usage thread
3. **No Connection Reuse**: Connections are created fresh for each operation
4. **Resource Limits**: Dynamic limits based on system resources

### Performance Characteristics

```
Unified Pool Model:
• Permit acquisition: <1ms (unless at limit)
• Connection creation: ~5-20ms (in-memory database)
• Query execution: Variable
• Connection disposal: Automatic on drop
• Total: Creation + query time

Benefits:
• Thread safety guaranteed
• No connection state pollution
• Simpler error recovery
• Predictable resource usage
```

## Build and Deployment

### Single Codebase, Multiple Targets

```
                    ┌─────────────────────┐
                    │   Source Code       │
                    │  TypeScript/React   │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
            ┌──────────────┐     ┌──────────────┐
            │  Web Build   │     │ Tauri Build  │
            ├──────────────┤     ├──────────────┤
            │ yarn build   │     │ yarn tauri:  │
            │              │     │    build     │
            ├──────────────┤     ├──────────────┤
            │ Output:      │     │ Output:      │
            │ - index.html │     │ - .app (Mac) │
            │ - .js/.css   │     │ - .exe (Win) │
            │ - assets/    │     │ - .deb/.rpm  │
            └──────────────┘     └──────────────┘
                    │                     │
                    ▼                     ▼
            ┌────────────┐       ┌────────────┐
            │  Web Host  │       │   Direct   │
            │  (Vercel)  │       │  Install   │
            └────────────┘       └────────────┘
```

### Build Commands

```bash
# Development
yarn dev              # Web development server
yarn tauri:dev        # Desktop development (safe start)
yarn tauri:dev:unsafe # Desktop without safety checks

# Production
yarn build            # Web production build
yarn tauri:build      # Desktop installers

# Testing
yarn test             # Run all tests
yarn test:unit        # Unit tests only
yarn playwright       # E2E tests
```

### Platform-Specific Builds

**Web Build**:
- Outputs to `dist/` directory
- Uses Vite for bundling
- Deployable to any static hosting

**Tauri Build**:
- macOS: `.app`, `.dmg`
- Windows: `.exe`, `.msi`
- Linux: `.deb`, `.rpm`, `.AppImage`
- Bundles include native DuckDB

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

### Development Workflow

1. **Initial Setup**:
   ```bash
   # Install dependencies
   yarn install

   # For Tauri development, also need:
   cargo install tauri-cli
   ```

2. **Making Changes**:
   - UI changes: Work in `src/` - automatically used by both platforms
   - Engine changes: Update appropriate engine in `src/engines/`
   - Tauri-specific: Update Rust code in `src-tauri/src/`

3. **Testing Changes**:
   ```bash
   # Test web version
   yarn dev

   # Test desktop version
   yarn tauri:dev
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
│  • No installation needed        • Large datasets           │
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

### Troubleshooting

#### Port Conflicts (Development)
- **Issue**: Port 5174 already in use
- **Solution**: Run `yarn tauri:dev` which automatically finds available port

#### Database Lock Conflicts
- **Issue**: "Database already in use" error
- **Solution**: Close other PondPilot instances or check with `lsof`

#### Persistence Issues
- **Web**: Check IndexedDB in browser DevTools
- **Tauri**: Check SQLite at `~/Library/Application Support/io.pondpilot.desktop/pondpilot_sys.db`

#### Building Issues
- **macOS**: Ensure Xcode Command Line Tools installed
- **Windows**: Install Microsoft C++ Build Tools
- **Linux**: Install `libwebkit2gtk-4.0-dev` and build essentials

## Summary

PondPilot's two-headed architecture provides:

1. **Single Codebase**: Maintain one codebase for multiple platforms
2. **Platform Optimization**: Native performance where available
3. **Consistent UX**: Same interface across all platforms
4. **Progressive Enhancement**: Features adapt to platform capabilities
5. **Efficient Streaming**: Handle large datasets without memory issues
6. **Unified Connection Management**: Permit-based system ensures thread safety

The abstraction layers ensure that platform-specific code is isolated, making the codebase maintainable and extensible. Whether running in a browser or as a desktop app, users get the best possible experience for their platform.

## Implementation Status

### ✅ Completed

1. **Database Engine Abstraction Layer**
   - DuckDB WASM Engine for web
   - DuckDB Tauri Engine for desktop with native performance
   - Unified interface across all engines
   - Unified connection pool with permit-based system

2. **Tauri Desktop Application**
   - Full native DuckDB integration via Rust
   - IPC bridge for TypeScript ↔ Rust communication
   - Arrow IPC streaming with cancellation support
   - Native file dialogs and system integration
   - Security hardening with path validation and SQL sanitization

3. **Persistence Layer**
   - SQLite persistence for Tauri via IPC commands
   - IndexedDB for web browser storage
   - Unified persistence adapter interface
   - Automatic platform detection and adapter selection

4. **Security Features**
   - Path traversal protection with validation
   - SQL identifier sanitization
   - Extension whitelisting (httpfs, parquet, json, etc.)
   - Resource limits based on system capabilities
   - MotherDuck token management

5. **Resource Management**
   - Dynamic resource limits calculation
   - Thread-safe connection management
   - Memory-aware query execution
   - Permit-based connection control

### 🚀 Future Enhancements

1. **Performance Optimizations**
   - Connection pre-warming
   - Idle connection cleanup
   - Query result caching

2. **Desktop Features**
   - System tray support
   - Auto-updater functionality
   - Native menu bar with shortcuts
   - macOS code signing and notarization

