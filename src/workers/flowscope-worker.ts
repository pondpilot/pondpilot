/**
 * FlowScope Web Worker
 *
 * Runs FlowScope WASM operations in a separate thread to avoid blocking the main UI.
 * Supports: analyze, split, completionItems operations.
 * Each request has an ID for cancellation support - stale responses are ignored by the client.
 */
import {
  initWasm,
  analyzeSql,
  splitStatements,
  completionItems,
  type AnalyzeResult,
  type StatementSplitResult,
  type CompletionItemsResult,
  type SchemaMetadata,
} from '@pondpilot/flowscope-core';
import wasmUrl from '@pondpilot/flowscope-core/wasm/flowscope_wasm_bg.wasm?url';

export type FlowScopeRequestType = 'analyze' | 'split' | 'completionItems';

export interface FlowScopeAnalyzeRequest {
  type: 'analyze';
  id: number;
  sql: string;
  dialect: string;
  schema?: SchemaMetadata;
}

export interface FlowScopeSplitRequest {
  type: 'split';
  id: number;
  sql: string;
  dialect: string;
}

export interface FlowScopeCompletionItemsRequest {
  type: 'completionItems';
  id: number;
  sql: string;
  dialect: string;
  cursorOffset: number;
  schema?: SchemaMetadata;
}

export type FlowScopeRequest =
  | FlowScopeAnalyzeRequest
  | FlowScopeSplitRequest
  | FlowScopeCompletionItemsRequest;

export interface FlowScopeSuccessResponse<T> {
  id: number;
  success: true;
  result: T;
}

export interface FlowScopeErrorResponse {
  id: number;
  success: false;
  error: string;
}

export type FlowScopeResponse<T> = FlowScopeSuccessResponse<T> | FlowScopeErrorResponse;

export type FlowScopeAnalyzeResponse = FlowScopeResponse<AnalyzeResult>;
export type FlowScopeSplitResponse = FlowScopeResponse<StatementSplitResult>;
export type FlowScopeCompletionItemsResponse = FlowScopeResponse<CompletionItemsResult>;

/**
 * Common FlowScope options used for all API calls.
 * - dialect: 'duckdb' - SQL dialect for parsing
 * - encoding: 'utf16' - Returns spans as UTF-16 code units (JavaScript string indices)
 *   This matches Monaco editor offsets and JS string methods, avoiding conversion overhead.
 */
const FLOWSCOPE_OPTIONS = {
  dialect: 'duckdb' as const,
  encoding: 'utf16' as const,
};

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

/**
 * Validates that FlowScope returns UTF-16 offsets as expected.
 * This runs once after WASM initialization to catch encoding mismatches early.
 *
 * Test case: "SELECT '😀'" where 😀 is a surrogate pair (2 UTF-16 code units, 4 UTF-8 bytes)
 * Expected UTF-16 offsets: statement spans [0, 12) where the string is 12 code units long
 */
async function validateUtf16Encoding(): Promise<void> {
  // Test string with emoji (surrogate pair) to verify UTF-16 encoding
  const testSql = "SELECT '😀'";
  const expectedLength = testSql.length; // 12 UTF-16 code units

  const result = await splitStatements({
    ...FLOWSCOPE_OPTIONS,
    sql: testSql,
  });

  if (result.statements.length !== 1) {
    console.error('FlowScope encoding validation failed: expected 1 statement');
    return;
  }

  const stmt = result.statements[0];
  if (stmt.end !== expectedLength) {
    console.error(
      `FlowScope encoding mismatch: expected UTF-16 end offset ${expectedLength}, got ${stmt.end}. ` +
        'Spans may not be in UTF-16 code units.',
    );
  }
}

async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;

  if (!wasmInitPromise) {
    // flowscope-core currently forwards `wasmUrl` directly to wasm-bindgen init.
    // Pass the newer object form expected by wasm-bindgen to avoid deprecation warnings.
    const wasmInitPath = { module_or_path: wasmUrl } as unknown as string;
    wasmInitPromise = initWasm({ wasmUrl: wasmInitPath }).then(async () => {
      wasmInitialized = true;
      // Validate UTF-16 encoding in dev mode
      if (import.meta.env.DEV) {
        await validateUtf16Encoding();
      }
    });
  }

  await wasmInitPromise;
}

async function handleAnalyze(request: FlowScopeAnalyzeRequest): Promise<void> {
  try {
    await ensureWasmInitialized();
    const result = await analyzeSql({
      ...FLOWSCOPE_OPTIONS,
      sql: request.sql,
      schema: request.schema,
    });
    globalThis.postMessage({
      id: request.id,
      success: true,
      result,
    } satisfies FlowScopeAnalyzeResponse);
  } catch (error) {
    globalThis.postMessage({
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies FlowScopeErrorResponse);
  }
}

async function handleSplit(request: FlowScopeSplitRequest): Promise<void> {
  try {
    await ensureWasmInitialized();
    const result = await splitStatements({
      ...FLOWSCOPE_OPTIONS,
      sql: request.sql,
    });
    globalThis.postMessage({
      id: request.id,
      success: true,
      result,
    } satisfies FlowScopeSplitResponse);
  } catch (error) {
    globalThis.postMessage({
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies FlowScopeErrorResponse);
  }
}

async function handleCompletionItems(request: FlowScopeCompletionItemsRequest): Promise<void> {
  try {
    await ensureWasmInitialized();
    const result = await completionItems({
      ...FLOWSCOPE_OPTIONS,
      sql: request.sql,
      cursorOffset: request.cursorOffset,
      schema: request.schema,
    });
    globalThis.postMessage({
      id: request.id,
      success: true,
      result,
    } satisfies FlowScopeCompletionItemsResponse);
  } catch (error) {
    globalThis.postMessage({
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies FlowScopeErrorResponse);
  }
}

globalThis.onmessage = async (event: MessageEvent<FlowScopeRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'analyze':
      await handleAnalyze(request);
      break;
    case 'split':
      await handleSplit(request);
      break;
    case 'completionItems':
      await handleCompletionItems(request);
      break;
  }
};
