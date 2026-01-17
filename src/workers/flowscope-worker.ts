/**
 * FlowScope Web Worker
 *
 * Runs FlowScope WASM operations in a separate thread to avoid blocking the main UI.
 * Supports: analyze, split, completionContext operations.
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

export type FlowScopeRequestType = 'analyze' | 'split' | 'completion';

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

export interface FlowScopeCompletionRequest {
  type: 'completion';
  id: number;
  sql: string;
  dialect: string;
  cursorOffset: number;
  schema?: SchemaMetadata;
}

export type FlowScopeRequest =
  | FlowScopeAnalyzeRequest
  | FlowScopeSplitRequest
  | FlowScopeCompletionRequest;

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
export type FlowScopeCompletionResponse = FlowScopeResponse<CompletionItemsResult>;

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;

  if (!wasmInitPromise) {
    wasmInitPromise = initWasm({ wasmUrl }).then(() => {
      wasmInitialized = true;
    });
  }

  await wasmInitPromise;
}

async function handleAnalyze(request: FlowScopeAnalyzeRequest): Promise<void> {
  try {
    await ensureWasmInitialized();
    const result = await analyzeSql({
      sql: request.sql,
      dialect: request.dialect as 'duckdb',
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
      sql: request.sql,
      dialect: request.dialect as 'duckdb',
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

async function handleCompletion(request: FlowScopeCompletionRequest): Promise<void> {
  try {
    await ensureWasmInitialized();
    const result = await completionItems({
      sql: request.sql,
      dialect: request.dialect as 'duckdb',
      cursorOffset: request.cursorOffset,
      schema: request.schema,
    });
    globalThis.postMessage({
      id: request.id,
      success: true,
      result,
    } satisfies FlowScopeCompletionResponse);
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
    case 'completion':
      await handleCompletion(request);
      break;
  }
};
