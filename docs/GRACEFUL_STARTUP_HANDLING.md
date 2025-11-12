# Graceful Startup Handling

This document describes the improvements made to handle startup failures gracefully in PondPilot.

## Issues Addressed

1. **Port Conflicts**: When the development server port (5174) is already in use
2. **Database Lock Conflicts**: When another instance of PondPilot has the DuckDB database locked
3. **Better Error Messages**: Clear, actionable error messages for users

## Solutions Implemented

### 1. Port Conflict Detection (Development)

- **Script**: `scripts/check-port.js`
  - Checks if the default port (5174) is available
  - If not, finds an available port and updates configurations
  - Shows which process is using the port
  - Updates both `tauri.conf.json` and creates `.env.local` with new port

- **Vite Configuration**: Updated to use `VITE_PORT` environment variable
- **Pre-dev Hook**: Automatically runs port check before `yarn dev`

### 2. Database Lock Detection

- **Startup Checks Module**: `src-tauri/src/startup_checks.rs`
  - Checks for database lock files before attempting connection
  - Uses `lsof` to identify processes holding locks
  - Provides detailed error messages with solutions

- **Main.rs Integration**: 
  - Performs database lock check before creating DuckDB engine
  - Shows clear error messages if database is locked

### 3. Safe Development Script

- **Script**: `scripts/tauri-dev-safe.sh`
  - Kills any existing pondpilot-desktop processes
  - Runs port availability check
  - Starts Tauri development server

## Usage

### For Development

```bash
# Safe start (recommended) - handles port conflicts and kills existing processes
yarn tauri:dev

# Unsafe start (original behavior)
yarn tauri:dev:unsafe

# Just run the web dev server (with port check)
yarn dev
```

### Error Messages

When the database is locked:
```
STARTUP ERROR: Database Already in Use
Another instance of PondPilot appears to be running.

Database: /Users/username/Library/Application Support/io.pondpilot.desktop/pondpilot.db

Process information:
COMMAND   PID   USER
pondpilot 12345 username

Please close the other instance before starting a new one.
```

When the port is in use:
```
⚠️  Port 5174 is already in use
   Process: node (PID: 67890, User: username)
✅ Found available port: 5175
✅ Updated tauri.conf.json with new port
✅ Updated .env.local with VITE_PORT=5175
```

## Technical Details

### Port Detection
- Uses Node.js `net` module to test port availability
- Falls back to next available port (up to 10 attempts)
- Updates configuration files automatically

### Database Lock Detection
- Checks for SQLite WAL (Write-Ahead Logging) files
- Uses `lsof` command to identify locking processes
- Provides process details for debugging

### Error Recovery
- Port conflicts: Automatically finds new port
- Database locks: Requires manual intervention (closing other instance)
- Clear error messages guide users to resolution

## Future Improvements

1. **Windows/Linux Support**: Currently uses macOS-specific commands (lsof)
2. **GUI Error Dialogs**: Currently uses console output for errors
3. **Automatic Process Management**: Could offer to kill conflicting processes
4. **Configuration File**: Allow users to set preferred port ranges