import type { DuckDBBundles } from '@duckdb/duckdb-wasm';

import duckdbCoiPThreadWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url';
import duckdbCoiWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-coi.wasm?url';
import duckdbCoiWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.worker.js?url';
import duckdbEHWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbEHWasmWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import duckdbMvpWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbMvpWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

/**
 * DuckDB WASM bundles served from the application's origin instead of the jsDelivr CDN.
 * Vite will fingerprint these assets and the hosting config already ships long-lived caching
 * headers, so browsers can keep the wasm/worker payloads cached across reloads.
 */
export const LOCAL_DUCKDB_BUNDLES: DuckDBBundles = {
  mvp: {
    mainModule: duckdbMvpWasmUrl,
    mainWorker: duckdbMvpWorkerUrl,
  },
  eh: {
    mainModule: duckdbEHWasmUrl,
    mainWorker: duckdbEHWasmWorkerUrl,
  },
  coi: {
    mainModule: duckdbCoiWasmUrl,
    mainWorker: duckdbCoiWorkerUrl,
    pthreadWorker: duckdbCoiPThreadWorkerUrl,
  },
};

export const hasLocalDuckDBBundles =
  Boolean(duckdbEHWasmUrl) &&
  Boolean(duckdbEHWasmWorkerUrl) &&
  Boolean(duckdbMvpWasmUrl) &&
  Boolean(duckdbMvpWorkerUrl) &&
  Boolean(duckdbCoiWasmUrl) &&
  Boolean(duckdbCoiWorkerUrl) &&
  Boolean(duckdbCoiPThreadWorkerUrl);
