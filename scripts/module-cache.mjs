import { createHash } from 'node:crypto';

export const DUCKDB_WASM_VERSION = '1.33.1-dev53.0';
export const DUCKDB_EXTENSION_VERSION = '1.5.2';

const duckDbWasmBase = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_WASM_VERSION}/dist`;
const duckDbExtensionBase = `https://extensions.duckdb.org/v${DUCKDB_EXTENSION_VERSION}`;

/**
 * Exact browser resources used by the integration suite. Checksums intentionally live next to
 * their URLs so dependency upgrades cannot silently change the test runtime.
 */
export const moduleCacheResources = Object.freeze([
  {
    url: `${duckDbWasmBase}/duckdb-browser-eh.worker.js`,
    sha256: '644e3f454c48992b7f5831c31f637944d08bdfa0407f850107fef51b80974001',
  },
  {
    url: `${duckDbWasmBase}/duckdb-eh.wasm`,
    sha256: 'c359111b0688d604e1e4e9c4d1ec3376adfe318d43546d0562f2deea73a5316f',
  },
  ...[
    {
      name: 'httpfs',
      eh: 'c50b7965a2622b7715dcd652290f77701fa45d42827ddd316649096d984b64b2',
    },
    {
      name: 'iceberg',
      eh: '5dfc5857b87e28fa88c5c762cab015a1e5ba0446e474ca8e6a065a576ce8305d',
    },
    {
      name: 'parquet',
      eh: 'e68f467c4f5d7502ebed06eec190d1a2d5dee0f218f328547e2c2a41ae58435e',
    },
    {
      name: 'avro',
      eh: 'da055b981d64b69609a7a29431e2a7763aa3ecf618744ec87e4f0233b7b0f283',
    },
    {
      name: 'json',
      eh: '637a59cde9e686976de825a150f6ab9bc3ec5ac60fd0809ed01623aae110d0eb',
    },
    {
      name: 'excel',
      eh: '888bf118999ec4b733e581e530c1c0b0df30412af3aea9d717bd42ba3d669477',
    },
  ].map(({ name, eh }) => ({
    url: `${duckDbExtensionBase}/wasm_eh/${name}.duckdb_extension.wasm`,
    sha256: eh,
  })),
]);

export const localModuleArtifacts = Object.freeze([
  {
    path: 'public/duckdb-extensions/read_stat/read_stat.duckdb_extension.wasm',
    sha256: '6002e7b04b9063f325ed61345e10bd78505053558fcb53188089db3436ba2ff2',
  },
]);

export function getModuleCacheKey(input) {
  const url = input instanceof URL ? input : new URL(input);
  return encodeURIComponent(`${url.host}${url.pathname}`);
}

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}
