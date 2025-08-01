# PondPilot Tauri Desktop Implementation Plan

## Overview
This document outlines the implementation plan for creating a Tauri-based desktop version of PondPilot, leveraging the existing database abstraction layer.

## 1. Project Setup and Structure

### New Directory Structure
```
pondpilot/
├── pondpilot-tauri/           # New Tauri desktop app
│   ├── src-tauri/             # Rust backend
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   ├── build.rs
│   │   └── src/
│   │       ├── main.rs
│   │       ├── database/
│   │       │   ├── mod.rs
│   │       │   ├── engine.rs
│   │       │   ├── connection.rs
│   │       │   └── pool.rs
│   │       ├── commands/
│   │       │   ├── mod.rs
│   │       │   ├── query.rs
│   │       │   ├── file.rs
│   │       │   └── metadata.rs
│   │       └── extensions/
│   │           ├── mod.rs
│   │           └── loader.rs
│   └── src/                   # Frontend (shared with web)
│       └── tauri-adapter.ts   # Tauri-specific adapter
```

## 2. Implementation Phases

### Phase 1: Tauri Project Initialization (Week 1)
- Set up Tauri project structure
- Configure build system for multiple platforms
- Implement basic window management
- Set up development environment with hot-reload

### Phase 2: Rust Backend - DuckDB Integration (Week 2-3)
- Implement DuckDB Rust bindings integration
- Create connection pool management in Rust
- Implement all database engine interface methods
- Handle file system operations natively
- Set up extension loading system

### Phase 3: IPC Bridge Implementation (Week 3-4)
- Define Tauri commands for all database operations
- Implement streaming support for large query results
- Create efficient data serialization/deserialization
- Handle error propagation from Rust to TypeScript

### Phase 4: Frontend Integration (Week 4-5)
- Complete `DuckDBTauriEngine` implementation
- Update database factory to detect Tauri environment
- Ensure seamless switching between engines
- Maintain compatibility with existing UI components

### Phase 5: Advanced Features (Week 5-6)
- Native file picker integration
- System tray support
- Auto-updater functionality
- Native menu bar with shortcuts
- OS-specific optimizations

## 3. Technical Implementation Details

### Rust Backend Architecture

#### Core Database Module (`src-tauri/src/database/engine.rs`)
```rust
use duckdb::{Connection, Result};
use tauri::State;
use std::sync::{Arc, Mutex};

pub struct DuckDBEngine {
    connection_pool: Arc<Mutex<ConnectionPool>>,
    config: EngineConfig,
}

impl DuckDBEngine {
    pub fn new(config: EngineConfig) -> Result<Self> {
        // Initialize DuckDB with native performance
        let pool = ConnectionPool::new(config.pool_size)?;
        Ok(Self {
            connection_pool: Arc::new(Mutex::new(pool)),
            config,
        })
    }
    
    pub async fn execute_query(&self, sql: &str, params: Vec<Value>) -> Result<QueryResult> {
        // Direct execution without WASM overhead
    }
    
    pub async fn stream_query(&self, sql: &str) -> Result<QueryStream> {
        // Native streaming support
    }
}
```

#### Tauri Commands (`src-tauri/src/commands/query.rs`)
```rust
#[tauri::command]
pub async fn execute_query(
    engine: State<'_, DuckDBEngine>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult, String> {
    engine.execute_query(&sql, params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stream_query(
    engine: State<'_, DuckDBEngine>,
    window: Window,
    stream_id: String,
    sql: String,
) -> Result<(), String> {
    // Stream results back via events
    tauri::async_runtime::spawn(async move {
        let mut stream = engine.stream_query(&sql).await?;
        while let Some(batch) = stream.next().await {
            window.emit(&format!("stream-{}", stream_id), batch)?;
        }
        window.emit(&format!("stream-{}-end", stream_id), ())?;
    });
    Ok(())
}
```

### Frontend Integration

#### Complete DuckDBTauriEngine Implementation
```typescript
// src/engines/duckdb-tauri-engine.ts
export class DuckDBTauriEngine implements DatabaseEngine {
  private invoke: any;
  private listen: any;
  private connectionPool: TauriConnectionPool | null = null;

  async initialize(config: EngineConfig): Promise<void> {
    const { invoke, listen } = await import('@tauri-apps/api');
    this.invoke = invoke;
    this.listen = listen;
    
    await this.invoke('initialize_duckdb', { config });
    this.ready = true;
  }

  async createConnectionPool(size: number): Promise<ConnectionPool> {
    this.connectionPool = new TauriConnectionPool(this.invoke, size);
    return this.connectionPool;
  }

  async* stream(sql: string, params?: any[]): AsyncGenerator<any> {
    const streamId = crypto.randomUUID();
    const buffer: any[] = [];
    let done = false;
    
    // Set up listener first
    const unlisten = await this.listen(`stream-${streamId}`, (event: any) => {
      buffer.push(event.payload);
    });
    
    const unlistenEnd = await this.listen(`stream-${streamId}-end`, () => {
      done = true;
    });
    
    // Start streaming
    await this.invoke('stream_query', { streamId, sql, params });
    
    // Yield results as they come
    try {
      while (!done || buffer.length > 0) {
        if (buffer.length > 0) {
          yield buffer.shift();
        } else {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } finally {
      unlisten();
      unlistenEnd();
    }
  }
}
```

## 4. Key Advantages of Tauri Implementation

1. **Performance**: Native DuckDB without WASM overhead
2. **File Access**: Direct file system access without browser restrictions
3. **Memory**: No browser memory limits
4. **Extensions**: Load native .duckdb_extension files
5. **Size**: Smaller bundle size (Rust binary vs Electron)
6. **Security**: Better sandboxing and permission model

## 5. Build and Distribution

### Multi-platform Build Configuration
```json
// tauri.conf.json
{
  "build": {
    "beforeBuildCommand": "yarn build",
    "beforeDevCommand": "yarn dev",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": ["deb", "app", "msi", "dmg"],
    "identifier": "io.pondpilot.desktop",
    "icon": ["icons/icon.ico", "icons/icon.png", "icons/icon.icns"]
  }
}
```

## 6. Testing Strategy

- Unit tests for Rust backend
- Integration tests for IPC communication
- E2E tests using Tauri's WebDriver support
- Cross-platform testing matrix
- Performance benchmarks vs web version

## 7. Migration Path

Users can transition seamlessly:
1. Export data from web version
2. Install desktop app
3. Import data or connect to same files
4. Enjoy native performance

The abstraction layer ensures code sharing between web and desktop versions, minimizing maintenance overhead.

## 8. Build System Requirements

### Prerequisites
- Rust toolchain (stable)
- Node.js 18+
- Platform-specific dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft C++ Build Tools
  - **Linux**: `libwebkit2gtk-4.0-dev`, `build-essential`, `libssl-dev`

### Development Tools
- Tauri CLI: `cargo install tauri-cli`
- DuckDB development headers
- Platform-specific SDKs