# Test Fixtures

This directory contains fixtures used across the application's tests.

## Browser Caching and Context Reuse

To optimize test run speed, we've implemented a caching mechanism for expensive resources like the duckdb-wasm modules.

### Module Caching Implementation

Persists downloaded modules in `.module-cache` directory

- Loads from network if modules are not cached
- Saves any newly downloaded modules to cache automatically
- Works offline after modules are cached

### Pre-caching Modules

You can pre-cache the modules by running the following command:

```bash
just cache-online-modules
```
