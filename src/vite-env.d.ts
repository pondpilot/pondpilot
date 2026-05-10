/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL for the Polly AI proxy (defaults to https://ai-proxy.pondpilot.io) */
  readonly VITE_POLLY_PROXY_URL?: string;
  readonly VITE_DUCKDB_ALLOW_UNSIGNED_EXTENSIONS?: string;
  readonly VITE_DUCKDB_ENABLE_GSHEETS_EXTENSION?: string;
  readonly VITE_READ_STAT_EXTENSION_URL?: string;
  readonly VITE_GSHEETS_EXTENSION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
