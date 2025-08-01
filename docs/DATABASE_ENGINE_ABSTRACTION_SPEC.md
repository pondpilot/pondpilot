# PondPilot Database Engine Abstraction Layer Specification

## Table of Contents
1. [Overview](#overview)
2. [Current Architecture](#current-architecture)
3. [Proposed Architecture](#proposed-architecture)
4. [Database Engine Interface](#database-engine-interface)
5. [Implementation Details](#implementation-details)
6. [Deployment Options](#deployment-options)
7. [Migration Strategy](#migration-strategy)
8. [Feature Detection and Flags](#feature-detection-and-flags)

## Overview

This specification outlines the architectural changes needed to support multiple database engines in PondPilot, enabling deployment as a web app (using DuckDB-WASM), desktop app (using native DuckDB), or hybrid solution.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React UI Layer                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ SQL Editor  │  │ Data Explorer│  │ Query Result│  │ Settings │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────┘ │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │    DuckDB Context Provider   │
                    │  (duckdb-context.tsx)        │
                    └─────────────┬────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │    Connection Pool           │
                    │  (Manages DuckDB connections)│
                    └─────────────┬────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │    DuckDB-WASM Library       │
                    │  (@duckdb/duckdb-wasm)       │
                    └─────────────┬────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │    Web Worker                │
                    │  (Runs DuckDB in background) │
                    └──────────────────────────────┘
```

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React UI Layer                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ SQL Editor  │  │ Data Explorer│  │ Query Result│  │ Settings │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────┘ │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │    Database Context Provider │
                    │  (engine-agnostic)           │
                    └─────────────┬────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │    Database Engine Interface │ ◄─── Abstraction Layer
                    └──────┬──────────────┬────────┘
                           │              │
              ┌────────────▼───┐    ┌─────▼───────────┐
              │ Runtime Config │    │ Feature Detector │
              └────────────┬───┘    └─────────────────┘
                           │
        ┌──────────────────┼──────────────────┬─────────────────┐
        │                  │                  │                 │
┌───────▼────────┐ ┌───────▼────────┐ ┌──────▼───────┐ ┌───────▼────────┐
│ DuckDB WASM    │ │ DuckDB Native  │ │ DuckDB Tauri │ │ SQLite Engine  │
│ Engine         │ │ Engine         │ │ Engine       │ │ (future)       │
├────────────────┤ ├────────────────┤ ├──────────────┤ ├────────────────┤
│ • Web Worker   │ │ • Node Process │ │ • Rust IPC   │ │ • WASM/Native  │
│ • OPFS Storage │ │ • Direct FS    │ │ • Direct FS  │ │ • Local Storage│
│ • File Reader  │ │ • Native Ext   │ │ • Native Ext │ │ • Limited SQL  │
└────────────────┘ └────────────────┘ └──────────────┘ └────────────────┘
```

## Database Engine Interface

### Core Interface Definition

```typescript
// src/engines/types.ts

export interface DatabaseEngine {
  // Lifecycle
  initialize(config: EngineConfig): Promise<void>;
  shutdown(): Promise<void>;
  isReady(): boolean;
  
  // Connection Management
  createConnection(): Promise<DatabaseConnection>;
  createConnectionPool(size: number): Promise<ConnectionPool>;
  
  // File Operations
  registerFile(options: FileRegistration): Promise<void>;
  dropFile(name: string): Promise<void>;
  listFiles(): Promise<FileInfo[]>;
  
  // Query Execution
  execute(sql: string, params?: any[]): Promise<QueryResult>;
  stream(sql: string, params?: any[]): AsyncIterator<any>;
  prepare(sql: string): Promise<PreparedStatement>;
  
  // Metadata
  getCatalog(): Promise<CatalogInfo>;
  getDatabases(): Promise<DatabaseInfo[]>;
  getTables(database: string): Promise<TableInfo[]>;
  getColumns(database: string, table: string): Promise<ColumnInfo[]>;
  
  // Persistence
  checkpoint(): Promise<void>;
  export(format: ExportFormat): Promise<ArrayBuffer | string>;
  import(data: ArrayBuffer | string, format: ExportFormat): Promise<void>;
  
  // Extensions
  loadExtension(name: string, options?: ExtensionOptions): Promise<void>;
  listExtensions(): Promise<ExtensionInfo[]>;
  
  // Features
  getCapabilities(): EngineCapabilities;
}

export interface DatabaseConnection {
  id: string;
  execute(sql: string, params?: any[]): Promise<QueryResult>;
  stream(sql: string, params?: any[]): AsyncIterator<any>;
  prepare(sql: string): Promise<PreparedStatement>;
  close(): Promise<void>;
  isOpen(): boolean;
}

export interface EngineConfig {
  type: 'duckdb-wasm' | 'duckdb-native' | 'duckdb-tauri' | 'sqlite';
  storageType?: 'memory' | 'persistent';
  storagePath?: string;
  workerUrl?: string;
  wasmUrl?: string;
  extensions?: string[];
  options?: Record<string, any>;
}

export interface EngineCapabilities {
  supportsStreaming: boolean;
  supportsMultiThreading: boolean;
  supportsDirectFileAccess: boolean;
  supportsExtensions: boolean;
  supportsPersistence: boolean;
  supportsRemoteFiles: boolean;
  maxFileSize?: number;
  maxMemory?: number;
  supportedFileFormats: string[];
  supportedExtensions: string[];
}
```

### Engine Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DatabaseEngineFactory                           │
├─────────────────────────────────────────────────────────────────────┤
│ + createEngine(config: EngineConfig): DatabaseEngine                │
│ + detectOptimalEngine(): EngineConfig                               │
│ + isEngineAvailable(type: string): boolean                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼──────────┐ ┌───────▼────────┐ ┌────────▼─────────┐
│ DuckDBWasmEngine   │ │ DuckDBNative   │ │ DuckDBTauri      │
├────────────────────┤ ├────────────────┤ ├──────────────────┤
│ - worker: Worker   │ │ - db: Database │ │ - invoke: IPC    │
│ - db: AsyncDuckDB  │ │ - pool: Pool[] │ │ - commands: Map  │
│ - opfs: OPFS       │ │ - native: true │ │ - rust: Backend  │
├────────────────────┤ ├────────────────┤ ├──────────────────┤
│ + initialize()     │ │ + initialize() │ │ + initialize()   │
│ + registerFile()   │ │ + registerFile()│ + registerFile()  │
│ + execute()        │ │ + execute()    │ │ + execute()      │
│ + stream()         │ │ + stream()     │ │ + stream()       │
└────────────────────┘ └────────────────┘ └──────────────────┘
```

## Implementation Details

### 1. DuckDB WASM Engine (Current Implementation)

```typescript
// src/engines/duckdb-wasm-engine.ts

export class DuckDBWasmEngine implements DatabaseEngine {
  private worker: Worker | null = null;
  private db: AsyncDuckDB | null = null;
  private logger: ConsoleLogger;
  private bundles: DuckDBBundles;

  async initialize(config: EngineConfig): Promise<void> {
    // Current implementation from duckdb-context.tsx
    const bundle = await selectBundle(this.bundles);
    this.worker = new Worker(bundle.mainWorker!);
    this.logger = new ConsoleLogger();
    this.db = new AsyncDuckDB(this.logger, this.worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    // Handle OPFS persistence if configured
    if (config.storageType === 'persistent') {
      await this.initializeOPFS();
    }
  }

  async registerFile(options: FileRegistration): Promise<void> {
    if (options.type === 'file-handle') {
      // Browser File System Access API
      await this.db!.registerFileHandle(
        options.name,
        options.handle,
        DuckDBDataProtocol.BROWSER_FILEREADER,
        true
      );
    } else if (options.type === 'url') {
      // Remote file
      await this.db!.registerFileURL(
        options.name,
        options.url,
        DuckDBDataProtocol.HTTP,
        false
      );
    }
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    const conn = await this.db!.connect();
    try {
      if (params) {
        const stmt = await conn.prepare(sql);
        const result = await stmt.query(...params);
        return this.transformResult(result);
      }
      const result = await conn.query(sql);
      return this.transformResult(result);
    } finally {
      await conn.close();
    }
  }

  getCapabilities(): EngineCapabilities {
    return {
      supportsStreaming: true,
      supportsMultiThreading: this.isCrossOriginIsolated(),
      supportsDirectFileAccess: 'showOpenFilePicker' in window,
      supportsExtensions: true,
      supportsPersistence: true,
      supportsRemoteFiles: true,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB browser limit
      supportedFileFormats: ['csv', 'parquet', 'json', 'xlsx'],
      supportedExtensions: ['httpfs', 'postgres_scanner']
    };
  }
}
```

### 2. DuckDB Native Engine (Electron)

```typescript
// src/engines/duckdb-native-engine.ts

export class DuckDBNativeEngine implements DatabaseEngine {
  private db: any; // Native DuckDB instance
  private pool: ConnectionPool;

  async initialize(config: EngineConfig): Promise<void> {
    // Dynamic import for Electron environment
    const { Database } = await import('duckdb');
    
    this.db = new Database(config.storagePath || ':memory:');
    this.pool = new NativeConnectionPool(this.db, config.poolSize || 10);
    
    // Load extensions
    for (const ext of config.extensions || []) {
      await this.loadExtension(ext);
    }
  }

  async registerFile(options: FileRegistration): Promise<void> {
    // Native DuckDB can directly access file system
    if (options.type === 'path') {
      // Just verify file exists, DuckDB will read directly
      const fs = await import('fs/promises');
      await fs.access(options.path);
      // No registration needed - use path directly in queries
    }
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      const callback = (err: Error, result: any) => {
        if (err) reject(err);
        else resolve(this.transformResult(result));
      };
      
      if (params) {
        this.db.prepare(sql).run(params, callback);
      } else {
        this.db.all(sql, callback);
      }
    });
  }

  async stream(sql: string, params?: any[]): AsyncIterator<any> {
    // Return async iterator for streaming results
    const statement = this.db.prepare(sql);
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            const row = await statement.get();
            if (!row) {
              await statement.finalize();
              return { done: true, value: undefined };
            }
            return { done: false, value: row };
          }
        };
      }
    };
  }

  getCapabilities(): EngineCapabilities {
    return {
      supportsStreaming: true,
      supportsMultiThreading: true,
      supportsDirectFileAccess: true,
      supportsExtensions: true,
      supportsPersistence: true,
      supportsRemoteFiles: true,
      maxFileSize: undefined, // No browser limits
      supportedFileFormats: ['csv', 'parquet', 'json', 'xlsx', 'arrow', 'orc'],
      supportedExtensions: ['all'] // Can load any .duckdb_extension
    };
  }
}
```

### 3. DuckDB Tauri Engine

```typescript
// src/engines/duckdb-tauri-engine.ts

export class DuckDBTauriEngine implements DatabaseEngine {
  private invoke: any; // Tauri invoke function

  async initialize(config: EngineConfig): Promise<void> {
    const { invoke } = await import('@tauri-apps/api');
    this.invoke = invoke;
    
    // Initialize DuckDB in Rust backend
    await this.invoke('initialize_duckdb', { config });
  }

  async registerFile(options: FileRegistration): Promise<void> {
    // Tauri can access file system through Rust
    await this.invoke('register_file', { options });
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    // IPC to Rust backend
    const result = await this.invoke('execute_query', { sql, params });
    return this.transformResult(result);
  }

  async stream(sql: string, params?: any[]): AsyncIterator<any> {
    // Streaming through Tauri events
    const { listen } = await import('@tauri-apps/api/event');
    const streamId = crypto.randomUUID();
    
    // Start streaming query
    await this.invoke('stream_query', { streamId, sql, params });
    
    return {
      [Symbol.asyncIterator]() {
        let buffer: any[] = [];
        let done = false;
        
        // Listen for stream events
        const unlisten = listen(`stream-${streamId}`, (event) => {
          if (event.payload.type === 'data') {
            buffer.push(event.payload.data);
          } else if (event.payload.type === 'end') {
            done = true;
            unlisten.then(fn => fn());
          }
        });
        
        return {
          async next() {
            // Wait for data if buffer is empty
            while (buffer.length === 0 && !done) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            if (buffer.length > 0) {
              return { done: false, value: buffer.shift() };
            }
            
            return { done: true, value: undefined };
          }
        };
      }
    };
  }

  getCapabilities(): EngineCapabilities {
    return {
      supportsStreaming: true,
      supportsMultiThreading: true,
      supportsDirectFileAccess: true,
      supportsExtensions: true,
      supportsPersistence: true,
      supportsRemoteFiles: true,
      maxFileSize: undefined,
      supportedFileFormats: ['all'],
      supportedExtensions: ['all']
    };
  }
}
```

## Deployment Options

### Option 1: Electron Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Renderer Process                         │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │            React UI (Unchanged)                     │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │         Database Context (Engine Interface)         │  │ │
│  │  └──────────────────────┬──────────────────────────────┘  │ │
│  └─────────────────────────┼─────────────────────────────────┘ │
│                            │ IPC Bridge                         │
│  ┌─────────────────────────▼─────────────────────────────────┐ │
│  │                    Main Process                            │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │           DuckDB Native Engine                      │  │ │
│  │  │  • Direct file system access                        │  │ │
│  │  │  • Native extensions (.duckdb_extension)            │  │ │
│  │  │  • No memory limits                                 │  │ │
│  │  │  • Full multi-threading                             │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Option 2: Tauri Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Tauri App                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    WebView (Frontend)                      │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │            React UI (Unchanged)                     │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │         Database Context (Engine Interface)         │  │ │
│  │  └──────────────────────┬──────────────────────────────┘  │ │
│  └─────────────────────────┼─────────────────────────────────┘ │
│                            │ Tauri IPC                          │
│  ┌─────────────────────────▼─────────────────────────────────┐ │
│  │                   Rust Backend                             │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │              DuckDB Rust Bindings                   │  │ │
│  │  │  • Zero-copy data transfer                          │  │ │
│  │  │  • Native performance                               │  │ │
│  │  │  • System integration                               │  │ │
│  │  │  • Smaller binary size                              │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Option 3: PWA + Native Helper Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      User's System                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────┐  ┌────────────────────────────┐ │
│  │      Web Browser          │  │    Native Helper App       │ │
│  │  ┌─────────────────────┐  │  │  ┌──────────────────────┐  │ │
│  │  │   PondPilot PWA     │  │  │  │  DuckDB Native       │  │ │
│  │  │  • DuckDB WASM      │  │  │  │  • File watcher      │  │ │
│  │  │  • Basic features   │◄─┼──┼─►│  • System tray       │  │ │
│  │  │  • Offline capable  │  │  │  │  • Local server      │  │ │
│  │  └─────────────────────┘  │  │  │  • Enhanced features │  │ │
│  │                           │  │  └──────────────────────┘  │ │
│  └───────────────────────────┘  └────────────────────────────┘ │
│                     ▲                          ▲                │
│                     └──────────┬───────────────┘                │
│                                │ WebSocket/HTTP                 │
│                                │ Local connection               │
│                                ▼                                │
│                   ┌────────────────────────┐                    │
│                   │   Protocol Handler     │                    │
│                   │  • pondpilot:// URLs   │                    │
│                   │  • File associations   │                    │
│                   └────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘

Communication Flow:
1. PWA detects native helper through localhost ping
2. If available, switches to hybrid mode
3. Large files handled by native helper
4. Results streamed back to PWA
5. Graceful fallback if helper unavailable
```

## Migration Strategy

### Phase 1: Create Abstraction Layer (Week 1-2)

```
Current State                    Target State
─────────────                    ────────────
                                           
DuckDBContext ──┐                ┌─► DatabaseContext
     │          │                │         │
     ▼          │                │         ▼
DuckDB-WASM ────┘                └──► EngineInterface
                                           │
                                           ▼
                                     DuckDBWasmEngine
```

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Create detailed spec document with ASCII diagrams", "status": "completed", "priority": "high"}, {"id": "2", "content": "Design database engine interface architecture", "status": "completed", "priority": "high"}, {"id": "3", "content": "Document migration strategy and phases", "status": "in_progress", "priority": "medium"}, {"id": "4", "content": "Include PWA + Native Helper architecture", "status": "pending", "priority": "medium"}, {"id": "5", "content": "Document Tauri architecture option", "status": "pending", "priority": "medium"}]