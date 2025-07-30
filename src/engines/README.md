# Database Engine Abstraction Layer

This directory contains the database engine abstraction layer that allows PondPilot to work with different database backends.

## Architecture

The abstraction layer provides a unified interface (`DatabaseEngine`) that can be implemented by different database engines:

- **DuckDB WASM** - Current implementation for web browsers
- **DuckDB Native** - For Electron desktop apps (stub)
- **DuckDB Tauri** - For Tauri desktop apps (stub)
- **SQLite** - Future lightweight option (not implemented)

## Usage

### Using the New Abstraction

```typescript
import { DatabaseEngineFactory } from '@engines/database-engine-factory';
import { DatabaseConnectionPoolProvider } from '@features/database-context/database-context';

// In your app root:
function App() {
  return (
    <DatabaseConnectionPoolProvider maxPoolSize={30}>
      <YourApp />
    </DatabaseConnectionPoolProvider>
  );
}

// In your components:
import { useDatabaseConnectionPool } from '@features/database-context/database-context';

function MyComponent() {
  const pool = useDatabaseConnectionPool();
  
  const runQuery = async () => {
    if (!pool) return;
    
    const conn = await pool.acquire();
    try {
      const result = await conn.execute('SELECT 42 as answer');
      console.log(result.rows[0].answer); // 42
    } finally {
      await pool.release(conn);
    }
  };
}
```

### Using with Legacy DuckDB Context

For compatibility with existing code, use the compatibility layer:

```typescript
import { DuckDBCompatProvider } from '@features/database-context/duckdb-compat-context';

// This provides the same context interface as the original DuckDB context
function App() {
  return (
    <DuckDBCompatProvider maxPoolSize={30}>
      <YourApp />
    </DuckDBCompatProvider>
  );
}
```

### Specifying Engine Type

```typescript
import { EngineConfig } from '@engines/types';

const config: EngineConfig = {
  type: 'duckdb-wasm',  // or 'duckdb-native', 'duckdb-tauri'
  storageType: 'persistent',
  storagePath: 'opfs://pondpilot.db',
  extensions: ['httpfs'],
};

<DatabaseConnectionPoolProvider 
  maxPoolSize={30}
  engineConfig={config}
>
  <YourApp />
</DatabaseConnectionPoolProvider>
```

### Auto-detecting Best Engine

```typescript
import { DatabaseEngineFactory } from '@engines/database-engine-factory';

const optimalConfig = DatabaseEngineFactory.detectOptimalEngine();
// Returns appropriate config based on environment
```

## Implementation Status

- ✅ **DuckDB WASM Engine** - Fully implemented
- ✅ **Database Engine Interface** - Complete
- ✅ **Connection Pool Abstraction** - Complete
- ✅ **Factory Pattern** - Complete
- ⚠️ **DuckDB Native Engine** - Stub only
- ⚠️ **DuckDB Tauri Engine** - Stub only
- ❌ **SQLite Engine** - Not implemented

## Next Steps

To use native engines in Electron or Tauri:

1. Implement the stub methods in `duckdb-native-engine.ts` or `duckdb-tauri-engine.ts`
2. Add the necessary dependencies (e.g., `duckdb` npm package for Electron)
3. Handle IPC communication for Tauri
4. Update the build configuration to include native modules