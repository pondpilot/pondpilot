# AGENTS guide for PondPilot

## Purpose
Enable human and automated agents to work productively and safely in this repository by providing a concise, actionable map of the codebase, workflows, and guardrails.

## Quick start

### Prerequisites
- **Node.js** >= 18 (managed by Corepack/Yarn 4)
- **Yarn Berry** via `corepack enable`
- **Rust toolchain** (only for Tauri desktop development)
- **macOS tooling** (Xcode, codesign - only for mac notarization/signing)

### Initial setup
```bash
just setup        # Enable corepack + install dependencies
just dev          # Start web dev server (http://localhost:5173)
just tauri-dev    # Start desktop dev (requires Rust)
```

## Essential commands

### Development
```bash
just dev            # Web dev server (http://localhost:5173)
just tauri-dev      # Desktop dev with hot reload
just preview        # Build and preview production version
```

### Code quality
```bash
just typecheck      # TypeScript type checking
just lint           # Run ESLint + Stylelint
just lint-fix       # Auto-fix linting issues
just fmt            # Format with Prettier
just fmt-check      # Check formatting without changes
```

### Testing
```bash
just test-unit      # Jest unit tests
just test           # Playwright integration tests (with build)
just test-no-build  # Playwright tests (reuse existing build)
just test-all       # Run all test suites
```

### Building & deployment
```bash
just build          # Production web build → dist/
just tauri-build    # Desktop app bundle → src-tauri/target/
just docker-build   # Docker image for web distribution
just docker-run     # Serve preview on port 4173
```

## Project structure

### Root configuration
```
├── package.json        # Dependencies and scripts
├── justfile           # Task runner (preferred over npm/yarn scripts)
├── vite.config.ts     # Vite bundler configuration
└── tsconfig.json      # TypeScript configuration
```

### Frontend (src/)
```
src/
├── features/          # Major product areas
│   ├── script-editor/ # SQL editor with tabs and AI
│   └── data-explorer/ # Table viewer and schema browser
├── components/        # Reusable UI components
├── hooks/            # Custom React hooks
├── models/           # TypeScript types and domain models
├── services/         # External integrations (file system, AI)
├── controllers/      # Business logic and utilities
├── engines/          # DuckDB engine implementations
│   ├── duckdb-wasm-connection.ts
│   └── duckdb-tauri-engine.ts
├── store/            # Zustand state management
└── theme/            # Mantine UI customizations
```

### Desktop app (src-tauri/)
```
src-tauri/
├── src/
│   ├── commands/     # IPC endpoints from frontend
│   ├── database/     # Native DuckDB integration
│   ├── persistence/  # Data persistence layer
│   └── windows/      # Window management
├── tauri.conf.json   # App configuration
└── capabilities/     # Security permissions
```

### Testing & docs
```
├── tests/
│   ├── unit/         # Jest unit tests
│   └── integration/  # Playwright E2E tests
└── docs/             # Architecture documentation

```

## Tech stack
- **Frontend**: React 19, TypeScript, Vite 5, Mantine UI, Zustand
- **Data engine**: DuckDB (WASM for web, native for desktop)
- **Desktop**: Tauri 2 (Rust-based)
- **Testing**: Jest (unit), Playwright (E2E)
- **Code quality**: ESLint, Stylelint, Prettier
- **Package management**: Yarn 4 (Berry) with PnP

## Development workflows

### Web development (fast iteration)
```bash
just dev          # Start Vite dev server
# Open http://localhost:5173
# Hot module replacement enabled
# Uses DuckDB WASM engine
```

### Desktop development (native features)
```bash
just tauri-dev    # Start Tauri app with hot reload
# Uses native DuckDB engine
# Access to file system and OS features
# Requires Rust toolchain
```

### Testing workflow
```bash
# Before committing:
just typecheck    # Ensure types are correct
just lint-fix     # Fix linting issues
just fmt          # Format code
just test-unit    # Run unit tests
just test         # Run integration tests
```

### Production build
```bash
# Web distribution:
just build        # Creates dist/ folder

# Desktop app:
just tauri-build  # Creates installer in src-tauri/target/

# Docker deployment:
just docker-build && just docker-run
```

## Agent coding guidelines

### File discovery & reading
```bash
# Fast discovery (preferred):
rg --files --hidden -g '!.git' -g '!node_modules'
rg "pattern" --type ts --type tsx

# Focused reading:
head -50 file.ts       # First 50 lines
tail -30 file.ts       # Last 30 lines
sed -n '100,200p' file # Specific line range

# AVOID:
find . -name "*.ts"    # Slow recursive search
grep -r "pattern" .    # Inefficient full scan
```

### Code editing principles
- **Small, targeted changes**: Fix the root cause, not symptoms
- **Match existing style**: Follow patterns in neighboring code
- **Self-documenting code**: Avoid obvious comments
- **Stay focused**: Don't fix unrelated issues
- **Preserve functionality**: Never break existing features

### Pre-commit checklist
```bash
# MUST pass before marking work complete:
just typecheck        # ✓ No TypeScript errors
just lint            # ✓ Clean ESLint/Stylelint
just fmt-check       # ✓ Properly formatted
just test-unit       # ✓ Unit tests pass
just test            # ✓ Integration tests pass

# For Tauri changes:
cd src-tauri && cargo check
```

### Yarn 4 (Berry) requirements
- **Never mix package managers** (no npm/pnpm commands)
- **Use corepack**: Automatically handled by `just setup`
- **PnP mode**: Dependencies in .yarn/cache, not node_modules
- **Zero-installs**: Dependencies committed to repo

## Architecture details

### Frontend (React/TypeScript)

#### State management (Zustand)
- **Store location**: `src/store/`
- **Persistence**: IndexedDB for web, SQLite for desktop
- **Key files**:
  - `store/index.ts` - Main store definition
  - `store/persistence-*.ts` - Storage adapters
  - `store/restore.ts` - Session restoration

#### DuckDB engines
- **Web engine**: `src/engines/duckdb-wasm-connection.ts`
  - Runs in browser using WASM
  - Supports multi-threading with SharedArrayBuffer
- **Desktop engine**: `src/engines/duckdb-tauri-engine.ts`
  - Native DuckDB via Tauri IPC
  - Better performance for large datasets

#### Core features
- **Script editor**: `src/features/script-editor/`
  - Multi-tab SQL editor with syntax highlighting
  - AI assistance integration
- **Data explorer**: `src/features/data-explorer/`
  - Schema browser and table viewer
  - Direct file access without copying

#### File system access
- **Browser**: File System Access API (Chrome only)
- **Desktop**: Native file system via Tauri
- **Implementation**: `src/services/file-picker/`

### Desktop app (Tauri/Rust)

#### Configuration
- **App config**: `src-tauri/tauri.conf.json`
- **Permissions**: `src-tauri/capabilities/*.json`
- **Security**: Capability-based access control

#### Key modules
- **Startup**: `src/startup_checks.rs` - Environment validation
- **Commands**: `src/commands/` - Frontend IPC endpoints
- **Database**: `src/database/` - Native DuckDB integration
- **Persistence**: `src/persistence/` - Data storage layer

## Security & privacy

### Critical rules
- **Never commit secrets** (API keys, tokens, passwords)
- **Tauri capabilities**: Don't broaden permissions without review
- **Browser storage**: Use IndexedDB for sensitive data, not localStorage
- **File access**: Always validate file paths and permissions
- **API keys**: Store in OS keychain (desktop) or secure browser storage

### Data handling
- All processing happens client-side (no backend servers)
- User data never leaves their device
- Direct file access without copying to cache
- API keys managed locally by users

## Testing strategy

### Unit tests (Jest)
```bash
just test-unit           # Run all unit tests
yarn test:unit MyComponent  # Test specific component

# Test structure:
tests/unit/
├── components/       # UI component tests
├── hooks/           # Hook tests
└── utils/           # Utility function tests
```

### Integration tests (Playwright)
```bash
just test               # Build + run all tests
just test-no-build      # Run tests with existing build
yarn test tests/integration/specific.spec.ts  # Single test

# Test structure:
tests/integration/
├── fixtures/        # Test data and utilities
└── *.spec.ts       # Test suites
```

## Common patterns & conventions

### TypeScript/React
```typescript
// Functional components with typed props
interface MyComponentProps {
  data: DataModel;  // Use types from src/models/
  onUpdate: (value: string) => void;
}

export function MyComponent({ data, onUpdate }: MyComponentProps) {
  // Use hooks for state and effects
  const [state, setState] = useState<string>();
  
  // Follow existing patterns in features/
  return <MantineComponent />;
}
```

### Import conventions
```typescript
// Use path aliases from tsconfig
import { Component } from '@/components';
import { useStore } from '@/store';
import type { Model } from '@/models';
```

### Error handling
```typescript
try {
  await riskyOperation();
} catch (error) {
  // Use consistent error handling
  console.error('[Module] Operation failed:', error);
  throw new Error('User-friendly message');
}
```

## Performance considerations

### WASM loading
- DuckDB WASM is ~40MB - lazy load when possible
- Enable caching headers for production
- Use SharedArrayBuffer for multi-threading (requires CORS)

### File handling
- Use File System Access API for direct access
- Avoid copying large files to memory
- Stream processing for large datasets

### State management
- Minimize re-renders with proper memoization
- Use Zustand selectors for fine-grained updates
- Persist only essential state

## Troubleshooting

### Common issues & fixes

| Issue | Solution |
|-------|----------|
| Yarn/Node errors | `just setup` to reset corepack |
| Type errors | `just typecheck` and fix iteratively |
| Stale preview | `just clean && just build` |
| Desktop build fails | Check `src-tauri/tauri.conf.json` |
| Tests fail | Ensure clean build with `just test` |
| WASM not loading | Check CORS headers and SharedArrayBuffer |

### Debug commands
```bash
# Check environment:
node --version        # Should be >= 18
yarn --version        # Should be 4.x
rustc --version       # For Tauri development

# Reset everything:
just clean
rm -rf .yarn/cache node_modules
just setup
```

## Documentation

### Key documents
- `README.md` - User-facing documentation
- `docs/PONDPILOT_ARCHITECTURE.md` - System design
- `docs/TAURI_PERSISTENCE_DESIGN.md` - Data persistence
- `docs/GRACEFUL_STARTUP_HANDLING.md` - Startup flow
- `docs/TAURI_UNIFIED_STREAMING_ARCHITECTURE.md` - IPC design

### Contributing
1. Create feature branch from `main`
2. Make focused changes following guidelines
3. Run full test suite: `just test-all`
4. Submit PR with clear description:
   - What changed and why
   - How it was tested
   - Any risks or follow-ups

## Quick reference

### Must-know commands
```bash
just setup         # Initialize project
just dev          # Start development
just test-all     # Run all tests
just build        # Production build
```

### Before committing
```bash
just typecheck    # ✓ Types correct
just lint-fix     # ✓ Fix linting
just fmt          # ✓ Format code
just test-unit    # ✓ Unit tests pass
```

### File patterns
```bash
# Find TypeScript files:
rg --type ts --type tsx "pattern"

# Find React components:
rg "export.*function.*Props" --type tsx

# Find Zustand stores:
rg "create\(" src/store/
```
