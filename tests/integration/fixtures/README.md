# Test Fixtures

This directory contains fixtures used across the application's tests.

## Deterministic browser module cache

DuckDB-WASM modules and extensions are downloaded before Playwright starts. Their exact URLs and
SHA-256 checksums are pinned in `scripts/module-cache.mjs`.

### Module Caching Implementation

The fixture serves only entries from `.module-cache` that match the manifest checksum:

- cache misses never fall through to a CDN during a test;
- unknown CDN URLs fail the test and must be added to the manifest deliberately;
- corrupted entries are replaced by the pre-cache command and rejected by the fixture.

### Pre-caching Modules

You can pre-cache the modules by running the following command:

```bash
yarn cache:test-modules
```

Use `node scripts/cache-online-modules.mjs --offline` to verify an already populated cache without
network access.
