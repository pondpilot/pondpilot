# Bundled gsheets WASM extension

`gsheets.duckdb_extension.wasm` is an unsigned DuckDB extension loaded only
when `VITE_GSHEETS_EXTENSION_URL` points to it and
`VITE_DUCKDB_ALLOW_UNSIGNED_EXTENSIONS=true`.

Provenance for the checked-in artifact:

- Source: `https://github.com/melonamin/duckdb_gsheets`
- Fork commit: `e236703c6b5287590fc8faa808431bea68f39e37`
- DuckDB dependency used for this WASM build:
  `7dbb2e646fea939a89f10a55aa98c474cbb0c098` (DuckDB v1.5.1)
- Build target: `make wasm_eh`
- Artifact SHA-256:
  `a0ec6833c7768c139e947a2118778853a84e2c3b1661a1d1f8713f70036f507d`
- License: MIT; see the source repository's `LICENSE`

The fork commit records an older DuckDB submodule pointer. The artifact was
built with the dependency override listed above so it matches PondPilot's
DuckDB-WASM runtime. Reproduce this exact dependency state before comparing the
checksum.

Local sibling checkouts are never built automatically. A rebuild requires
`GSHEETS_WASM_AUTO_BUILD=true`, `GSHEETS_WASM_FORCE_REBUILD=true`, or an
explicit `GSHEETS_WASM_SOURCE`.
