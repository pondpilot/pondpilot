import {
  shouldDropWasmExtensionLog,
  buildDuckDBWorkerBootstrap,
} from '@features/duckdb-context/worker-log-filter';
import { describe, it, expect } from '@jest/globals';

// Real log lines emitted by the MotherDuck wasm_extension, captured from the
// browser console.
const BACKGROUND_CATALOG_WARN =
  '{"message":"Background catalog long poll failed: Request failed: Could not connect to MotherDuck. Please try again later or contact support@motherduck.com for help. (UNKNOWN, RPC \'BACKGROUND_CATALOG_LONG_POLL\', request id: \'819e79e9-1754-45f6-b33f-3c043203b250\')","thread":"2582512","time":"2026-05-30T17:22:59.627Z","log_level":"WARN","service":"wasm_extension","md.client.duckdb_id":"819e79e7-fa5c-43da-b269-532e4a571576"}';

const REMOTE_OPTIMIZER_INFO =
  '{"message":"RemoteExecutionOptimizer: option \'schema\' will set locally only.","thread":"2582512","time":"2026-05-30T17:23:08.864Z","log_level":"INFO","service":"wasm_extension","md.client.duckdb_id":"819e79e7-fa5c-43da-b269-532e4a571576","md.client.connection_id":"b15f9500-8a74-4c62-8e44-ac1893e3f82d","md.client.transaction_id":"25","md.client.query_id":"1"}';

// A genuine wasm_extension error that must NOT be filtered.
const GENUINE_WASM_ERROR =
  '{"message":"Authentication failed: invalid token","log_level":"ERROR","service":"wasm_extension"}';

describe('worker-log-filter', () => {
  describe('shouldDropWasmExtensionLog', () => {
    it('drops the background catalog long-poll warning', () => {
      expect(shouldDropWasmExtensionLog(BACKGROUND_CATALOG_WARN)).toBe(true);
    });

    it('drops the RemoteExecutionOptimizer info line', () => {
      expect(shouldDropWasmExtensionLog(REMOTE_OPTIMIZER_INFO)).toBe(true);
    });

    it('keeps other wasm_extension lines, including genuine errors', () => {
      expect(shouldDropWasmExtensionLog(GENUINE_WASM_ERROR)).toBe(false);
    });

    it('keeps a noisy phrase that is not tagged as wasm_extension', () => {
      // Both the wasm_extension tag and a known pattern are required, so an
      // app-level message mentioning the same phrase is never dropped.
      expect(
        shouldDropWasmExtensionLog('Background catalog long poll failed for some other reason'),
      ).toBe(false);
    });

    it('keeps ordinary non-wasm strings', () => {
      expect(shouldDropWasmExtensionLog('Loading DuckDB... 42%')).toBe(false);
      expect(shouldDropWasmExtensionLog('')).toBe(false);
    });

    it('keeps non-string arguments', () => {
      expect(shouldDropWasmExtensionLog(undefined)).toBe(false);
      expect(shouldDropWasmExtensionLog(null)).toBe(false);
      expect(shouldDropWasmExtensionLog(42)).toBe(false);
      expect(shouldDropWasmExtensionLog({ service: 'wasm_extension' })).toBe(false);
    });
  });

  describe('buildDuckDBWorkerBootstrap', () => {
    it('loads the real worker via importScripts with the given URL', () => {
      const url = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js';
      const bootstrap = buildDuckDBWorkerBootstrap(url);

      expect(bootstrap).toContain(`importScripts(${JSON.stringify(url)});`);
    });

    it('JSON-escapes the worker URL so it cannot break out of the call', () => {
      const url = 'https://example.com/worker.js";evil()//';
      const bootstrap = buildDuckDBWorkerBootstrap(url);

      // The URL is embedded as a JSON string literal, so the embedded quote is
      // escaped (\") and cannot terminate the importScripts argument early.
      expect(bootstrap).toContain(`importScripts(${JSON.stringify(url)});`);
      // No unescaped quote at the boundary where a break-out would occur.
      expect(bootstrap).not.toContain('worker.js";evil');
    });

    it('installs a working console filter when run in a worker-like global', () => {
      const bootstrap = buildDuckDBWorkerBootstrap('https://example.com/worker.js');

      // Simulate a classic-worker global: a console to wrap and a no-op
      // importScripts. Running the whole bootstrap installs the filter, then we
      // emit sample lines and assert what survives. This exercises the entire
      // injected mechanism end to end (serialization, console wrapping,
      // predicate, drop/keep) and would fail on any syntax error in the
      // bootstrap before it could break DuckDB worker startup. It also guards
      // self-containment: a predicate referencing any module-scope binding
      // would throw here when its serialized copy runs in the fresh scope.
      const emitted: string[] = [];
      const fakeConsole = {
        log: (...args: unknown[]) => emitted.push(`log:${String(args[0])}`),
        info: (...args: unknown[]) => emitted.push(`info:${String(args[0])}`),
        warn: (...args: unknown[]) => emitted.push(`warn:${String(args[0])}`),
        error: (...args: unknown[]) => emitted.push(`error:${String(args[0])}`),
        debug: (...args: unknown[]) => emitted.push(`debug:${String(args[0])}`),
      };

      // The bootstrap references the worker globals `console` and
      // `importScripts`; provide them as function parameters. new Function is
      // safe here: the body is built entirely from this module's own source
      // plus a JSON-escaped URL, never untrusted data.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const run = new Function('console', 'importScripts', bootstrap);
      run(fakeConsole, () => {});

      fakeConsole.warn(BACKGROUND_CATALOG_WARN);
      fakeConsole.info(REMOTE_OPTIMIZER_INFO);
      fakeConsole.error(GENUINE_WASM_ERROR);
      fakeConsole.log('Loading DuckDB... 42%');

      // The two noisy lines are dropped; the genuine error and the app log pass.
      expect(emitted).toEqual([`error:${GENUINE_WASM_ERROR}`, 'log:Loading DuckDB... 42%']);
    });
  });
});
