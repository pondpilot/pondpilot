/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL for the Polly AI proxy (defaults to https://ai-proxy.pondpilot.io) */
  readonly VITE_POLLY_PROXY_URL?: string;

  /** Optional CORS proxy URL for remote object-store requests. */
  readonly VITE_CORS_PROXY_URL?: string;

  /** Optional bug report proxy URL for Slack bug-report submissions. */
  readonly VITE_BUG_REPORT_PROXY_URL?: string;

  /** Optional DuckDB-WASM main module URL used to test newer compatible builds. */
  readonly VITE_DUCKDB_WASM_MAIN_MODULE?: string;

  /** Optional DuckDB-WASM main worker URL used to test newer compatible builds. */
  readonly VITE_DUCKDB_WASM_MAIN_WORKER?: string;

  /** Optional DuckDB-WASM pthread worker URL used to test newer compatible builds. */
  readonly VITE_DUCKDB_WASM_PTHREAD_WORKER?: string;

  /** Forces the MVP DuckDB-WASM bundle when set to "true". */
  readonly VITE_DUCKDB_WASM_FORCE_MVP?: string;

  /** Allows unsigned DuckDB-WASM extensions when set to "true". */
  readonly VITE_DUCKDB_ALLOW_UNSIGNED_EXTENSIONS?: string;

  /** Optional read_stat extension artifact URL used to test newer compatible builds. */
  readonly VITE_READ_STAT_EXTENSION_URL?: string;

  /** Optional Quack extension artifact URL used to test newer DuckDB-WASM-compatible builds. */
  readonly VITE_QUACK_WASM_EXTENSION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
