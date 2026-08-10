export interface ModuleCacheResource {
  readonly url: string;
  readonly sha256: string;
}

export interface LocalModuleArtifact {
  readonly path: string;
  readonly sha256: string;
}

export const DUCKDB_WASM_VERSION: string;
export const DUCKDB_EXTENSION_VERSION: string;
export const moduleCacheResources: readonly ModuleCacheResource[];
export const localModuleArtifacts: readonly LocalModuleArtifact[];
export function getModuleCacheKey(input: string | URL): string;
export function sha256(input: import('node:crypto').BinaryLike): string;
