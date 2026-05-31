/**
 * DuckDB worker console-log filtering.
 *
 * The MotherDuck extension (native code compiled into the WASM loaded from
 * ext.motherduck.com) emits structured logs tagged `"service":"wasm_extension"`.
 * Emscripten routes the module's stdout/stderr to `console.log`/`console.warn`
 * inside the worker, so these bypass DuckDB-WASM's `ConsoleLogger` entirely and
 * cannot be silenced by lowering its log level.
 *
 * Two of those lines are pure noise in the PondPilot context:
 *
 *  - "Background catalog long poll failed: Could not connect to MotherDuck" —
 *    the extension's background catalog-sync channel retries on a timer; the
 *    streaming long-poll RPC is unreliable over the WASM transport even while
 *    foreground queries succeed, so it logs a WARN every few seconds forever.
 *
 *  - "RemoteExecutionOptimizer: option 'schema'/'search_path' will set locally
 *    only" — once the extension is loaded its optimizer hooks every query
 *    (including local-only ones); PondPilot sets `search_path`/`USE` around query
 *    execution, so this INFO fires on ordinary, non-MotherDuck queries.
 *
 * We drop only those two patterns and let every other wasm_extension line
 * through, so genuine MotherDuck errors and warnings remain visible.
 */

/**
 * Returns true when a console argument is a known-noisy MotherDuck
 * wasm_extension log line that should be dropped.
 *
 * MUST stay self-contained: this function is serialized via `toString()` into
 * the DuckDB worker bootstrap (see `buildDuckDBWorkerBootstrap`) and executes in
 * a fresh worker global, so it must not reference any module-scope binding,
 * import, or modern-syntax helper.
 */
export function shouldDropWasmExtensionLog(firstArg: unknown): boolean {
  if (typeof firstArg !== 'string') return false;
  if (firstArg.indexOf('"service":"wasm_extension"') === -1) return false;
  return (
    firstArg.indexOf('Background catalog long poll failed') !== -1 ||
    firstArg.indexOf('RemoteExecutionOptimizer:') !== -1
  );
}

/**
 * Builds the classic-worker bootstrap source for the DuckDB worker blob.
 *
 * Installs a console filter that drops known-noisy MotherDuck wasm_extension
 * logs, then loads the real DuckDB worker via `importScripts`. The filter is
 * installed before `importScripts` so it is in place before the WASM module
 * starts emitting logs, and runs in the worker global where those logs
 * originate.
 */
export function buildDuckDBWorkerBootstrap(mainWorkerUrl: string): string {
  return [
    '(function () {',
    `  var shouldDrop = ${shouldDropWasmExtensionLog.toString()};`,
    '  var methods = ["log", "info", "warn", "error", "debug"];',
    '  for (var i = 0; i < methods.length; i++) {',
    '    (function (name) {',
    '      var original = console[name];',
    '      if (typeof original !== "function") return;',
    '      console[name] = function () {',
    '        if (arguments.length > 0 && shouldDrop(arguments[0])) return;',
    '        return original.apply(console, arguments);',
    '      };',
    '    })(methods[i]);',
    '  }',
    '})();',
    `importScripts(${JSON.stringify(mainWorkerUrl)});`,
  ].join('\n');
}
