import { createHash } from 'node:crypto';

export const DUCKDB_WASM_VERSION = '1.33.1-dev65.0';
export const DUCKDB_EXTENSION_VERSION = '1.5.6';

const duckDbWasmBase = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_WASM_VERSION}/dist`;
const duckDbExtensionBase = `https://extensions.duckdb.org/v${DUCKDB_EXTENSION_VERSION}`;

/**
 * Exact browser resources used by the integration suite. Checksums intentionally live next to
 * their URLs so dependency upgrades cannot silently change the test runtime.
 */
export const moduleCacheResources = Object.freeze([
  {
    url: `${duckDbWasmBase}/duckdb-browser-eh.worker.js`,
    sha256: '89dc43da9faab0f5ecb4e05a4d0bc334c95db2743c146048ba9dd3621c0496eb',
  },
  {
    url: `${duckDbWasmBase}/duckdb-eh.wasm`,
    sha256: '7ba4e2ea49b0f8851e90b9ce404cc810d1dd998edabfc1d3677351ba2db0419a',
  },
  ...[
    {
      name: 'httpfs',
      eh: '10e7845b59ea0725e7eaf4ed740dc73ac1b1ec6145385cd64d528961c9837ab9',
    },
    {
      name: 'iceberg',
      eh: '7cc6ff29811556e3a0c64e9f6ae2ce96fac4665489a3d164fa1d0d543be50c96',
    },
    {
      name: 'parquet',
      eh: '33094a01b3a1dc27c4158f4c1fa13c45c240eea6ba07197a19a1925f002ca473',
    },
    {
      name: 'avro',
      eh: 'e037648f2c116d9139cb72fa6c86439d4e8a182a4927390ae1b70a6e4e78b144',
    },
    {
      name: 'json',
      eh: '2f100ca7d08598ad084405ab1bab7691fd1f30d0d50cc492534042c45205bada',
    },
    {
      name: 'excel',
      eh: 'b220bd36e0f1e39a75d73a0008d3d678cc9fd61a18fbc4d471f01e0d2e3e73c4',
    },
  ].map(({ name, eh }) => ({
    url: `${duckDbExtensionBase}/wasm_eh/${name}.duckdb_extension.wasm`,
    sha256: eh,
  })),
  // Quack build pinned by src/utils/quack.ts. Only the opt-in RUN_QUACK_E2E scenarios request it.
  {
    url: `${duckDbExtensionBase}/wasm_eh/quack.duckdb_extension.wasm`,
    sha256: '652ebf49a2a255bcbf5a3e46065aee0c40b2acc09cc2e55b6bc18b75345b2ee8',
  },
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
