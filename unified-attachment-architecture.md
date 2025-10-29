# Unified Database Attachment Architecture

## Table of Contents
1. [Problem Statement](#problem-statement)
2. [Current Architecture Issues](#current-architecture-issues)
3. [Proposed Unified Architecture](#proposed-unified-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Testing Strategy](#testing-strategy)

## Problem Statement

PondPilot needs to attach various types of databases (MotherDuck, PostgreSQL, MySQL, local files) to DuckDB connections. Currently, different database types follow different attachment pathways, leading to inconsistencies and bugs. Specifically:

- **MotherDuck databases** appear in `SELECT * FROM duckdb_databases` and are expandable in the sidebar
- **PostgreSQL/MySQL databases** do NOT appear in the database list or sidebar despite successful connection

The architecture must also support both:
- **Tauri environment**: Desktop app with Rust backend and system keychain for credentials
- **WASM environment**: Browser-based with no backend, credentials in cookies/localStorage

## Current Architecture Issues

### Current Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CURRENT (BROKEN) FLOW                        │
└─────────────────────────────────────────────────────────────────────┘

MotherDuck Path:                          PostgreSQL/MySQL Path:
================                          ======================

Frontend                                  Frontend
    │                                         │
    ├─ AttachmentLoader                       ├─ AttachmentLoader
    │     │                                   │     │
    │     ├─ ATTACH 'md:db'                   │     ├─ ConnectionsAPI.attachRemoteDatabase()
    │     │                                   │     │
    │     ▼                                   │     ▼
    │  connection.execute()                   │  Backend (Tauri invoke)
    │     │                                   │     │
    │     ▼                                   │     ├─ Creates NEW temporary connection
    │  Backend Connection A                   │     ├─ Attaches database
    │     │                                   │     └─ Discards connection ❌
    │     ├─ Database attached ✓              │
    │     │                                   │
    ▼     ▼                                   ▼
Query: SELECT * FROM duckdb_databases    Query: SELECT * FROM duckdb_databases
    │                                         │
    ├─ Runs on Connection A                  ├─ Runs on Connection B
    ├─ Sees MotherDuck ✓                     └─ No PostgreSQL ❌
    │
    ▼
Sidebar shows MotherDuck ✓               Sidebar empty ❌
```

### Problems Identified

1. **Different Pathways**: MotherDuck uses direct attachment, PostgreSQL uses backend API
2. **Connection Mismatch**: PostgreSQL attached to temporary connection, queries run on different connection
3. **No Persistence**: Attachments not preserved across connection pool
4. **WASM Incompatibility**: Backend-dependent approach won't work in browser

## Proposed Unified Architecture

### Design Principles

1. **Single Attachment Path**: All databases attached through `AttachmentLoader`
2. **Environment Adaptation**: Same logic flow, different credential sources
3. **Connection Consistency**: Attachments applied to ALL connections
4. **Security Preservation**: Tauri uses keychain, WASM uses browser storage

### Unified Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      UNIFIED ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────┘

                        AttachmentLoader
                              │
                ┌─────────────┴─────────────┐
                │                           │
         Tauri Environment            WASM Environment
                │                           │
    ┌───────────▼──────────┐    ┌──────────▼──────────┐
    │ ConnectionId DB?     │    │ ConnectionId DB?     │
    └───────────┬──────────┘    └──────────┬──────────┘
                │                           │
         Yes    │    No                Yes  │    No
                │                           │
    ┌───────────▼──────────┐    ┌──────────▼──────────┐
    │ Backend API:         │    │ Browser Storage:     │
    │ getAttachmentSql()   │    │ getCredentials()     │
    │ (keychain access)    │    │ buildSecretSql()     │
    └───────────┬──────────┘    └──────────┬──────────┘
                │                           │
                └─────────────┬─────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Execute on Conn   │
                    │ - CREATE SECRET   │
                    │ - ATTACH DATABASE │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Database Visible  │
                    │ in duckdb_databases│
                    └───────────────────┘
```

### Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONNECTION LIFECYCLE                            │
└─────────────────────────────────────────────────────────────────────┘

1. Frontend requests connection from pool
   ┌──────────────┐
   │ Pool.acquire │
   └──────┬───────┘
          │
2. Pool creates/reuses connection
   ┌──────▼───────────────────┐
   │ Backend: create_connection│───────┐
   └──────┬───────────────────┘       │
          │                            │
3. Backend connection created          │ Stored attachments
   ┌──────▼──────────────┐            │ from pool registry
   │ New DuckDB Connection│◄───────────┘
   │ + Load extensions    │
   │ + Apply attachments  │
   └──────┬──────────────┘
          │
4. Frontend receives connection
   ┌──────▼──────────────┐
   │ TauriConnection     │
   └──────┬──────────────┘
          │
5. AttachmentLoader runs (if needed)
   ┌──────▼──────────────────┐
   │ AttachmentLoader.load() │
   │ - MotherDuck           │
   │ - PostgreSQL/MySQL     │
   │ - Local files          │
   └──────┬─────────────────┘
          │
6. Connection ready for queries
   ┌──────▼──────────┐
   │ Ready to Query  │
   │ All DBs attached│
   └─────────────────┘
```

### Component Responsibilities

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPONENT RESPONSIBILITIES                       │
└─────────────────────────────────────────────────────────────────────┘

Frontend Components:
====================
┌─────────────────────────────────────┐
│ AttachmentLoader                    │
├─────────────────────────────────────┤
│ • Single point of attachment        │
│ • Handles all database types        │
│ • Environment detection              │
│ • Executes SQL on connection        │
└─────────────────────────────────────┘
                │
                ├── For Tauri
                │   └── Calls ConnectionsAPI.getAttachmentSql()
                │
                └── For WASM
                    └── Builds SQL from browser storage

┌─────────────────────────────────────┐
│ ConnectionsAPI (Tauri only)         │
├─────────────────────────────────────┤
│ • getAttachmentSql()                │
│ • Returns CREATE SECRET + ATTACH    │
│ • No execution, just SQL generation │
└─────────────────────────────────────┘

Backend Components (Tauri only):
=================================
┌─────────────────────────────────────┐
│ ConnectionsManager                  │
├─────────────────────────────────────┤
│ • Manages connection configs        │
│ • Accesses system keychain          │
│ • Generates attachment SQL          │
│ • Does NOT execute attachments      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ UnifiedPool                         │
├─────────────────────────────────────┤
│ • Tracks attached databases         │
│ • Re-applies on new connections     │
│ • Connection lifecycle management   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ DuckDBEngine                        │
├─────────────────────────────────────┤
│ • Manages persistent connections    │
│ • Applies attachments to all conns  │
│ • Query execution                   │
└─────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Backend API Changes

#### 1.1 Add `get_attachment_sql` Command

```rust
// src-tauri/src/connections/commands.rs

#[derive(Serialize)]
pub struct AttachmentSql {
    pub secret_sql: String,
    pub attach_sql: String,
}

#[tauri::command]
pub async fn get_attachment_sql(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    connection_id: String,
    database_alias: String,
) -> Result<AttachmentSql, String> {
    // Security check
    if window.label() != "main" {
        return Err("Unauthorized".into());
    }
    
    let id = Uuid::parse_str(&connection_id)?;
    
    // Get connection and secret from manager
    let connection = state.get_connection(id).await?;
    let secret = state.secrets_manager.get_secret(connection.secret_id).await?;
    
    // Build CREATE SECRET SQL
    let injector = DuckDBSecretInjector::new();
    let secret_sql = injector.build_create_secret(&secret)?;
    
    // Build ATTACH SQL
    let attach_sql = format!(
        "ATTACH '{}' AS {} (TYPE {}, SECRET {})",
        build_connection_string(&connection),
        database_alias,
        connection.connection_type.to_uppercase(),
        format!("secret_{}", secret.metadata.id.to_string().replace("-", "_"))
    );
    
    Ok(AttachmentSql {
        secret_sql,
        attach_sql,
    })
}
```

#### 1.2 Fix Pool Re-attachment

```rust
// src-tauri/src/database/unified_pool.rs

impl ConnectionPermit {
    pub fn create_connection(self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        
        // Configure connection
        conn.execute_batch(&config)?;
        
        // Load extensions
        for ext in self.extensions.blocking_lock().iter() {
            // ... load extension
        }
        
        // RE-ATTACH PREVIOUSLY ATTACHED DATABASES
        let attached_dbs = self.attached_databases.blocking_lock();
        for (alias, connection_string, db_type, secret_sql) in attached_dbs.iter() {
            // Create secret
            if let Err(e) = conn.execute_batch(secret_sql) {
                eprintln!("Warning: Failed to recreate secret: {}", e);
            }
            
            // Extract secret name from SQL
            let secret_name = extract_secret_name(secret_sql);
            
            // Attach database
            let attach_sql = format!(
                "ATTACH '{}' AS {} (TYPE {}, SECRET {})",
                connection_string, alias, db_type, secret_name
            );
            
            if let Err(e) = conn.execute(&attach_sql, []) {
                eprintln!("Warning: Failed to re-attach {}: {}", alias, e);
            }
        }
        
        Ok(conn)
    }
}
```

#### 1.3 Update `attach_remote_database` to Apply to All Connections

```rust
// src-tauri/src/database/engine.rs

pub async fn attach_remote_database(
    &self,
    database_alias: String,
    connection_string: String,
    database_type: String,
    secret_sql: String,
    secret_name: String,
) -> Result<()> {
    // Register for future connections
    self.pool.register_attached_database(
        database_alias.clone(),
        connection_string.clone(),
        database_type.clone(),
        secret_sql.clone(),
    ).await;
    
    // Apply to ALL existing persistent connections
    let connection_ids = self.connection_manager.list_connections().await?;
    
    for conn_id in connection_ids {
        let handle = self.connection_manager.get_connection(&conn_id).await?;
        
        // Execute secret and attach on this connection
        let combined_sql = format!("{}; {}", secret_sql, attach_sql);
        handle.execute(combined_sql, vec![]).await?;
    }
    
    Ok(())
}
```

### Phase 2: Frontend Changes

#### 2.1 Update ConnectionsAPI

```typescript
// src/services/connections-api.ts

export interface AttachmentSql {
  secretSql: string;
  attachSql: string;
}

export class ConnectionsAPI {
  static async getAttachmentSql(
    connectionId: string,
    databaseAlias: string
  ): Promise<AttachmentSql> {
    return await invoke<AttachmentSql>('get_attachment_sql', {
      connectionId,
      databaseAlias,
    });
  }
  
  // Remove or deprecate attachRemoteDatabase
}
```

#### 2.2 Update AttachmentLoader

```typescript
// src/services/attachment-loader.ts

import { isTauriEnvironment } from '@utils/browser';
import { ConnectionsAPI } from './connections-api';

export class AttachmentLoader {
  static async loadLocalDBsForConnection(connection: any): Promise<void> {
    const { dataSources, localEntries } = useAppStore.getState();
    
    for (const db of dbs) {
      try {
        // Handle connection-based databases (PostgreSQL/MySQL)
        if (isRemoteDatabase(db) && db.connectionId) {
          await this.attachConnectionBasedDatabase(connection, db);
          continue;
        }
        
        // Handle URL-based databases (MotherDuck, S3, etc.)
        if (isRemoteDatabase(db) && db.url) {
          await this.attachUrlBasedDatabase(connection, db);
          continue;
        }
        
        // Handle local file databases
        if (isLocalDatabase(db)) {
          await this.attachLocalDatabase(connection, db);
        }
      } catch (e) {
        logger.error(`Failed to attach database '${db.dbName}':`, e);
      }
    }
  }
  
  private static async attachConnectionBasedDatabase(
    connection: any,
    db: RemoteDB
  ): Promise<void> {
    let secretSql: string;
    let attachSql: string;
    
    if (isTauriEnvironment()) {
      // Tauri: Get SQL from backend (credentials from keychain)
      const sqlStatements = await ConnectionsAPI.getAttachmentSql(
        db.connectionId!,
        toDuckDBIdentifier(db.dbName)
      );
      secretSql = sqlStatements.secretSql;
      attachSql = sqlStatements.attachSql;
    } else {
      // WASM: Build SQL from browser-stored credentials
      const credentials = await BrowserCredentialStore.get(db.connectionId!);
      if (!credentials) {
        throw new Error('No credentials found for connection');
      }
      
      secretSql = this.buildSecretSql(db, credentials);
      attachSql = this.buildAttachSql(db);
    }
    
    // Execute on the connection (same for both environments)
    await connection.execute(secretSql);
    await connection.execute(attachSql);
    
    logger.info(`Attached connection-based DB '${db.dbName}'`);
  }
  
  private static buildSecretSql(db: RemoteDB, credentials: any): string {
    const secretName = `secret_${db.connectionId.replace(/-/g, '_')}`;
    
    if (db.dbType === 'postgres') {
      return `CREATE TEMPORARY SECRET IF NOT EXISTS ${secretName} (
        TYPE POSTGRES,
        HOST '${credentials.host}',
        PORT ${credentials.port},
        USER '${credentials.username}',
        PASSWORD '${credentials.password}'
      )`;
    } else if (db.dbType === 'mysql') {
      return `CREATE TEMPORARY SECRET IF NOT EXISTS ${secretName} (
        TYPE MYSQL,
        HOST '${credentials.host}',
        PORT ${credentials.port},
        USER '${credentials.username}',
        PASSWORD '${credentials.password}'
      )`;
    }
    
    throw new Error(`Unsupported database type: ${db.dbType}`);
  }
  
  private static buildAttachSql(db: RemoteDB): string {
    const secretName = `secret_${db.connectionId.replace(/-/g, '_')}`;
    const dbType = db.dbType.toUpperCase();
    
    return `ATTACH 'host=${db.host} port=${db.port} dbname=${db.database}' 
            AS ${toDuckDBIdentifier(db.dbName)} 
            (TYPE ${dbType}, SECRET ${secretName})`;
  }
}
```

### Phase 3: WASM Support

#### 3.1 Browser Credential Store

```typescript
// src/services/browser-credential-store.ts

export class BrowserCredentialStore {
  private static STORAGE_KEY = 'pondpilot_credentials';
  
  static async save(connectionId: string, credentials: any): Promise<void> {
    if (isTauriEnvironment()) {
      throw new Error('Use backend credential storage in Tauri');
    }
    
    const stored = this.getAll();
    stored[connectionId] = {
      ...credentials,
      // Encrypt sensitive fields before storing
      password: await this.encrypt(credentials.password),
    };
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
  }
  
  static async get(connectionId: string): Promise<any | null> {
    const stored = this.getAll();
    const creds = stored[connectionId];
    
    if (!creds) return null;
    
    return {
      ...creds,
      password: await this.decrypt(creds.password),
    };
  }
  
  private static getAll(): Record<string, any> {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  }
  
  private static async encrypt(value: string): Promise<string> {
    // Implement encryption (e.g., using SubtleCrypto API)
    // For now, base64 encode as placeholder
    return btoa(value);
  }
  
  private static async decrypt(value: string): Promise<string> {
    // Implement decryption
    return atob(value);
  }
}
```

## Testing Strategy

### Unit Tests

1. **Backend Tests**
   - Test `get_attachment_sql` command
   - Test pool re-attachment logic
   - Test connection manager attachment propagation

2. **Frontend Tests**
   - Test AttachmentLoader for all database types
   - Test environment detection
   - Test credential storage (WASM)

### Integration Tests

1. **Tauri Environment**
   ```typescript
   test('PostgreSQL appears in duckdb_databases', async () => {
     // Add PostgreSQL connection
     const conn = await savePostgresConnection(config);
     
     // Attach database
     await attachDatabase(conn.id, 'test_db');
     
     // Query should show the database
     const result = await pool.query('SELECT * FROM duckdb_databases');
     expect(result.rows).toContainEqual(
       expect.objectContaining({ database_name: 'test_db' })
     );
   });
   ```

2. **WASM Environment**
   ```typescript
   test('PostgreSQL works without backend', async () => {
     // Store credentials in browser
     await BrowserCredentialStore.save('conn-1', credentials);
     
     // Create RemoteDB
     const db = createConnectionBasedRemoteDB('conn-1', 'test_db');
     
     // Attach should work
     await AttachmentLoader.loadLocalDBsForConnection(connection);
     
     // Verify attachment
     const result = await connection.execute('SELECT * FROM duckdb_databases');
     expect(result.rows).toContainEqual(
       expect.objectContaining({ database_name: 'test_db' })
     );
   });
   ```

### End-to-End Tests

1. **Attachment Persistence**
   - Attach PostgreSQL database
   - Close and reopen connection
   - Verify database still attached

2. **Multi-Connection Consistency**
   - Create multiple connections
   - Attach database
   - Verify all connections see the database

3. **Environment Switching**
   - Test same codebase in both Tauri and WASM
   - Verify identical behavior

## Migration Path

### Phase 1: Backend Changes (Non-breaking)
1. Add new `get_attachment_sql` command
2. Fix pool re-attachment
3. Update engine attachment logic
4. Keep existing `attach_remote_database` for compatibility

### Phase 2: Frontend Migration
1. Update AttachmentLoader to use new API
2. Add WASM credential storage
3. Test in both environments
4. Deprecate old attachment methods

### Phase 3: Cleanup
1. Remove deprecated `attach_remote_database` backend command
2. Remove temporary connection creation logic
3. Update documentation

## Success Criteria

1. ✅ PostgreSQL/MySQL databases appear in `SELECT * FROM duckdb_databases`
2. ✅ All databases expandable in sidebar
3. ✅ Consistent behavior across database types
4. ✅ Works in both Tauri and WASM environments
5. ✅ Attachments persist across connection lifecycle
6. ✅ Security boundaries maintained (keychain vs browser storage)

## Conclusion

This unified architecture ensures that all database types follow the same attachment pathway, eliminating the current inconsistencies. By adapting to the environment while maintaining the same logical flow, we achieve both consistency and security. The implementation is backward-compatible and can be rolled out in phases without breaking existing functionality.