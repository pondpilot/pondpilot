import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import {
  deriveCoiBundle,
  isCoiBundleSelection,
  recommendedThreadCount,
  resolveDuckDBBundles,
  withoutCoiBundle,
} from '@features/duckdb-context/duckdb-bundles';
import { describe, it, expect, jest, afterEach } from '@jest/globals';

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev53.0/dist/';

const defaultBundles = (): DuckDBBundles => ({
  mvp: {
    mainModule: `${CDN_BASE}duckdb-mvp.wasm`,
    mainWorker: `${CDN_BASE}duckdb-browser-mvp.worker.js`,
  },
  eh: {
    mainModule: `${CDN_BASE}duckdb-eh.wasm`,
    mainWorker: `${CDN_BASE}duckdb-browser-eh.worker.js`,
  },
});

describe('duckdb-bundles', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('deriveCoiBundle', () => {
    it('derives the COI artifact URLs from the MVP main module URL', () => {
      expect(deriveCoiBundle(`${CDN_BASE}duckdb-mvp.wasm`)).toEqual({
        mainModule: `${CDN_BASE}duckdb-coi.wasm`,
        mainWorker: `${CDN_BASE}duckdb-browser-coi.worker.js`,
        pthreadWorker: `${CDN_BASE}duckdb-browser-coi.pthread.worker.js`,
      });
    });

    it('returns undefined for a URL that does not end in the MVP filename', () => {
      expect(deriveCoiBundle(`${CDN_BASE}custom-build.wasm`)).toBeUndefined();
    });

    it('returns undefined for a URL without a path separator', () => {
      expect(deriveCoiBundle('duckdb-mvp.wasm')).toBeUndefined();
    });
  });

  describe('resolveDuckDBBundles', () => {
    it('returns the default bundles unchanged when COI is not enabled', () => {
      const bundles = defaultBundles();
      expect(resolveDuckDBBundles(bundles, {})).toBe(bundles);
    });

    it('adds a derived COI entry when enableCoi is set', () => {
      const resolved = resolveDuckDBBundles(defaultBundles(), { enableCoi: true });
      expect(resolved.mvp).toEqual(defaultBundles().mvp);
      expect(resolved.eh).toEqual(defaultBundles().eh);
      expect(resolved.coi).toEqual({
        mainModule: `${CDN_BASE}duckdb-coi.wasm`,
        mainWorker: `${CDN_BASE}duckdb-browser-coi.worker.js`,
        pthreadWorker: `${CDN_BASE}duckdb-browser-coi.pthread.worker.js`,
      });
    });

    it('omits the COI entry when the MVP URL is not a standard dist layout', () => {
      const bundles = defaultBundles();
      bundles.mvp.mainModule = `${CDN_BASE}renamed.wasm`;
      const resolved = resolveDuckDBBundles(bundles, { enableCoi: true });
      expect(resolved.coi).toBeUndefined();
    });

    it('forceMvp keeps only the MVP bundle, even with enableCoi', () => {
      const resolved = resolveDuckDBBundles(defaultBundles(), {
        forceMvp: true,
        enableCoi: true,
      });
      expect(resolved.mvp).toEqual(defaultBundles().mvp);
      expect(resolved.eh).toBeUndefined();
      expect(resolved.coi).toBeUndefined();
    });

    it('artifact URL overrides replace the EH/MVP entries and never offer COI', () => {
      const resolved = resolveDuckDBBundles(defaultBundles(), {
        mainModule: 'https://example.com/duckdb-eh.wasm',
        mainWorker: 'https://example.com/duckdb-browser-eh.worker.js',
        pthreadWorker: 'https://example.com/duckdb-browser-eh.pthread.worker.js',
        enableCoi: true,
      });
      expect(resolved.mvp.mainModule).toBe('https://example.com/duckdb-eh.wasm');
      expect(resolved.eh).toEqual({
        mainModule: 'https://example.com/duckdb-eh.wasm',
        mainWorker: 'https://example.com/duckdb-browser-eh.worker.js',
        pthreadWorker: 'https://example.com/duckdb-browser-eh.pthread.worker.js',
      });
      expect(resolved.coi).toBeUndefined();
    });

    it('falls back to MVP artifacts and warns when EH defaults are unavailable', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const bundles = defaultBundles();
      delete bundles.eh;
      const resolved = resolveDuckDBBundles(bundles, {
        pthreadWorker: 'https://example.com/pthread.worker.js',
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(resolved.eh?.mainModule).toBe(bundles.mvp.mainModule);
      expect((resolved.eh as { pthreadWorker?: string }).pthreadWorker).toBe(
        'https://example.com/pthread.worker.js',
      );
    });
  });

  describe('isCoiBundleSelection', () => {
    it('identifies a selected COI bundle by its main module URL', () => {
      const bundles = resolveDuckDBBundles(defaultBundles(), { enableCoi: true });
      const selected = {
        mainModule: bundles.coi!.mainModule,
        mainWorker: bundles.coi!.mainWorker,
        pthreadWorker: bundles.coi!.pthreadWorker,
      };
      expect(isCoiBundleSelection(selected, bundles)).toBe(true);
    });

    it('returns false for an EH selection', () => {
      const bundles = resolveDuckDBBundles(defaultBundles(), { enableCoi: true });
      const selected = {
        mainModule: bundles.eh!.mainModule,
        mainWorker: bundles.eh!.mainWorker,
        pthreadWorker: null,
      };
      expect(isCoiBundleSelection(selected, bundles)).toBe(false);
    });

    it('returns false when no COI bundle is offered', () => {
      const bundles = defaultBundles();
      const selected = {
        mainModule: bundles.eh!.mainModule,
        mainWorker: bundles.eh!.mainWorker,
        pthreadWorker: null,
      };
      expect(isCoiBundleSelection(selected, bundles)).toBe(false);
    });
  });

  describe('withoutCoiBundle', () => {
    it('strips the COI entry and keeps MVP/EH', () => {
      const bundles = resolveDuckDBBundles(defaultBundles(), { enableCoi: true });
      const stripped = withoutCoiBundle(bundles);
      expect(stripped.coi).toBeUndefined();
      expect(stripped.mvp).toEqual(bundles.mvp);
      expect(stripped.eh).toEqual(bundles.eh);
    });

    it('handles a bundle map without an EH entry', () => {
      const stripped = withoutCoiBundle({ mvp: defaultBundles().mvp });
      expect(stripped.eh).toBeUndefined();
      expect(stripped.mvp).toEqual(defaultBundles().mvp);
    });
  });

  describe('recommendedThreadCount', () => {
    it('returns the floor of 2 when concurrency is unknown or tiny', () => {
      expect(recommendedThreadCount(Number.NaN)).toBe(2);
      expect(recommendedThreadCount(0)).toBe(2);
      expect(recommendedThreadCount(1)).toBe(2);
      expect(recommendedThreadCount(2)).toBe(2);
    });

    it('leaves one core for the main thread', () => {
      expect(recommendedThreadCount(4)).toBe(3);
      expect(recommendedThreadCount(8)).toBe(7);
    });

    it('caps at 8 threads on large machines', () => {
      expect(recommendedThreadCount(16)).toBe(8);
      expect(recommendedThreadCount(32)).toBe(8);
    });
  });
});
