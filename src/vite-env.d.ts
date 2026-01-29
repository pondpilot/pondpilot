/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL for the Polly AI proxy (defaults to https://ai-proxy.pondpilot.io) */
  readonly VITE_POLLY_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
