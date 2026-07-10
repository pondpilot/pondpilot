/**
 * DuckDB-WASM bundle resolution.
 *
 * `duckdb.getJsDelivrBundles()` only returns the single-threaded MVP and EH
 * builds — upstream intentionally excludes the multithreaded COI build while
 * it is experimental ("let the user opt in explicitly"). The app is served
 * cross-origin isolated (Cross-Origin-Opener-Policy: same-origin /
 * Cross-Origin-Embedder-Policy: credentialless), so when the COI bundle is
 * offered, `duckdb.selectBundle` picks it whenever the browser reports
 * `crossOriginIsolated` and supports WASM threads, exceptions and SIMD, and
 * falls back to EH (then MVP) otherwise — e.g. Safari, which does not support
 * COEP: credentialless and therefore never cross-origin isolates the app.
 *
 * The COI bundle is opt-in (`VITE_DUCKDB_WASM_ENABLE_COI=true`) because the
 * extension ecosystem cannot load under it yet: every dynamic extension on
 * extensions.duckdb.org is published as a `wasm_threads` artifact built
 * against non-shared memory, which fails WebAssembly linking against the
 * shared-memory COI module ("mismatch in shared state of memory", upstream
 * issue duckdb/duckdb-wasm#1916), and MotherDuck ships no wasm_threads build
 * at all. The engine itself works multithreaded (verified: 4–16 threads,
 * ~4x speedup on aggregation). Flip the default once upstream publishes
 * linkable wasm_threads extension artifacts; the runtime COI→EH fallback in
 * duckdb-context keeps an enabled COI safe in the meantime.
 *
 * This module is deliberately free of runtime imports from
 * `@duckdb/duckdb-wasm` (type-only imports are erased) so the resolution
 * logic stays unit-testable in Node.
 */
import type { DuckDBBundle, DuckDBBundles } from '@duckdb/duckdb-wasm';

/** Env-driven overrides for bundle resolution (see `src/vite-env.d.ts`). */
export interface DuckDBBundleOverrides {
  /** Optional DuckDB-WASM main module URL used to test newer compatible builds. */
  mainModule?: string;
  /** Optional DuckDB-WASM main worker URL used to test newer compatible builds. */
  mainWorker?: string;
  /** Optional DuckDB-WASM pthread worker URL used to test newer compatible builds. */
  pthreadWorker?: string;
  /** Forces the MVP bundle (disables EH and COI). */
  forceMvp?: boolean;
  /** Offers the multithreaded COI bundle for selection. */
  enableCoi?: boolean;
}

const MVP_MAIN_MODULE_FILENAME = 'duckdb-mvp.wasm';

/**
 * Derives the COI bundle URLs from the MVP main module URL.
 *
 * All bundle artifacts live side by side in the package `dist/` directory, so
 * deriving from the URL jsDelivr already pins to the installed package version
 * keeps the COI build in lockstep with the EH/MVP builds across upgrades.
 *
 * Returns undefined when the URL does not look like a standard dist layout
 * (in which case COI is simply not offered and selection proceeds as before).
 */
export function deriveCoiBundle(mvpMainModuleUrl: string): DuckDBBundles['coi'] | undefined {
  const lastSlash = mvpMainModuleUrl.lastIndexOf('/');
  if (lastSlash === -1) return undefined;
  if (mvpMainModuleUrl.slice(lastSlash + 1) !== MVP_MAIN_MODULE_FILENAME) return undefined;

  const base = mvpMainModuleUrl.slice(0, lastSlash + 1);
  return {
    mainModule: `${base}duckdb-coi.wasm`,
    mainWorker: `${base}duckdb-browser-coi.worker.js`,
    pthreadWorker: `${base}duckdb-browser-coi.pthread.worker.js`,
  };
}

/**
 * Builds the bundle map handed to `duckdb.selectBundle`.
 *
 * Without overrides this is the default jsDelivr map extended with a derived
 * COI entry (unless `disableCoi`). With overrides it preserves the historical
 * behavior exactly: explicit artifact URLs replace the EH/MVP entries and COI
 * is not offered, since override URLs target one specific build.
 */
export function resolveDuckDBBundles(
  defaultBundles: DuckDBBundles,
  overrides: DuckDBBundleOverrides = {},
): DuckDBBundles {
  const { mainModule, mainWorker, pthreadWorker, forceMvp, enableCoi } = overrides;

  if (mainModule || mainWorker || pthreadWorker || forceMvp) {
    const ehModuleFallback = !mainModule && !defaultBundles.eh?.mainModule;
    const ehWorkerFallback = !mainWorker && !defaultBundles.eh?.mainWorker;
    if (!forceMvp && (ehModuleFallback || ehWorkerFallback)) {
      console.warn(
        'DuckDB-WASM exception-handling (EH) bundle unavailable; falling back to MVP build. ' +
          'EH-only features will be disabled.',
      );
    }
    const overriddenBundles: DuckDBBundles = {
      mvp: {
        mainModule: mainModule || defaultBundles.mvp.mainModule,
        mainWorker: mainWorker || defaultBundles.mvp.mainWorker,
      },
      ...(forceMvp
        ? {}
        : {
            eh: {
              mainModule:
                mainModule || defaultBundles.eh?.mainModule || defaultBundles.mvp.mainModule,
              mainWorker:
                mainWorker || defaultBundles.eh?.mainWorker || defaultBundles.mvp.mainWorker,
              ...(pthreadWorker ? { pthreadWorker } : {}),
            },
          }),
    };
    return overriddenBundles;
  }

  if (!enableCoi) {
    return defaultBundles;
  }

  const coi = deriveCoiBundle(defaultBundles.mvp.mainModule);
  return coi ? { ...defaultBundles, coi } : defaultBundles;
}

/**
 * Returns true when `selectBundle` picked the multithreaded COI bundle.
 * Used to decide whether a failed initialization may retry single-threaded.
 */
export function isCoiBundleSelection(bundle: DuckDBBundle, bundles: DuckDBBundles): boolean {
  return bundles.coi != null && bundle.mainModule === bundles.coi.mainModule;
}

/**
 * Returns the bundle map with the COI entry removed, for the single-threaded
 * retry after a failed COI initialization.
 */
export function withoutCoiBundle(bundles: DuckDBBundles): DuckDBBundles {
  return {
    mvp: bundles.mvp,
    ...(bundles.eh ? { eh: bundles.eh } : {}),
  };
}

/**
 * Thread count passed as `maximumThreads` when opening a COI (multithreaded)
 * database. DuckDB-WASM defaults to 4 threads regardless of cores; measured
 * speedups on aggregation plateau past 8 threads while every pthread costs
 * stack and operator memory inside the 4GB wasm32 address space, so cap at 8
 * and always leave one core for the main thread and UI.
 */
export function recommendedThreadCount(hardwareConcurrency: number): number {
  if (!Number.isFinite(hardwareConcurrency) || hardwareConcurrency < 2) {
    return 2;
  }
  return Math.max(2, Math.min(hardwareConcurrency - 1, 8));
}
