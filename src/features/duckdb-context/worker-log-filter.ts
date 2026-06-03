/**
 * DuckDB worker console-log filtering.
 *
 * The MotherDuck extension (native code compiled into the WASM loaded from
 * ext.motherduck.com) emits structured logs tagged `"service":"wasm_extension"`.
 * Emscripten routes the module's stdout/stderr to `console.log`/`console.warn`
 * inside the worker, so these bypass DuckDB-WASM's `ConsoleLogger` entirely and
 * cannot be silenced by lowering its log level.
 *
 * We filter the noisiest of these while keeping anything that signals a real
 * problem:
 *
 *  - "Background catalog long poll failed: Could not connect to MotherDuck" —
 *    the extension's background catalog-sync channel retries on a timer; the
 *    streaming long-poll RPC is unreliable over the WASM transport even while
 *    foreground queries succeed, so it logs a WARN every few seconds forever.
 *
 *  - "RemoteExecutionOptimizer: ..." — once the extension is loaded its
 *    optimizer hooks every query (including local-only ones); PondPilot sets
 *    `search_path`/`USE` around query execution, so it fires on ordinary,
 *    non-MotherDuck queries.
 *
 *  - All other wasm_extension INFO lines — the one-time connect handshake
 *    (Welcome Pack, token, attach) and query plans. WARN and ERROR are kept,
 *    so genuine MotherDuck problems remain visible.
 *
 * Plus the WASM runtime's "Buffering missing file:" OPFS chatter (printed when a
 * persisted file is opened before it is buffered). Everything not matched here —
 * including the single "Successfully connected" line and any MotherDuck
 * WARN/ERROR — passes through.
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

  // OPFS buffer-cache miss chatter from the WASM runtime (plain text, not a
  // wasm_extension JSON line).
  if (firstArg.indexOf('Buffering missing file:') !== -1) return true;

  if (firstArg.indexOf('"service":"wasm_extension"') === -1) return false;

  // Repeating-noise patterns, dropped regardless of level: the long-poll WARN
  // retries every few seconds forever; the optimizer note fires on every query.
  if (firstArg.indexOf('Background catalog long poll failed') !== -1) return true;
  if (firstArg.indexOf('RemoteExecutionOptimizer:') !== -1) return true;

  // Connect handshake and query plans are all INFO; drop them but keep
  // WARN/ERROR so genuine MotherDuck problems stay visible.
  if (firstArg.indexOf('"log_level":"INFO"') !== -1) return true;

  return false;
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
