import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  DUCKDB_WASM_VERSION,
  getModuleCacheKey,
  localModuleArtifacts,
  moduleCacheResources,
  sha256,
} from './module-cache.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cacheDir = path.join(projectRoot, '.module-cache');
const offline = process.argv.includes('--offline');

const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
if (packageJson.dependencies['@duckdb/duckdb-wasm'] !== DUCKDB_WASM_VERSION) {
  throw new Error(
    `Module cache manifest pins DuckDB-WASM ${DUCKDB_WASM_VERSION}, but package.json uses ` +
      `${packageJson.dependencies['@duckdb/duckdb-wasm']}. Update the URLs and checksums together.`,
  );
}

await fs.mkdir(cacheDir, { recursive: true });

for (const artifact of localModuleArtifacts) {
  const artifactPath = path.join(projectRoot, artifact.path);
  const content = await fs.readFile(artifactPath);
  assertChecksum(artifact.path, content, artifact.sha256);
}

for (const resource of moduleCacheResources) {
  const cachePath = path.join(cacheDir, getModuleCacheKey(resource.url));
  const cached = await readIfPresent(cachePath);
  if (cached && sha256(cached) === resource.sha256) continue;

  if (offline) {
    throw new Error(`Missing or corrupt module cache entry: ${resource.url}`);
  }

  const response = await fetch(resource.url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to pre-cache ${resource.url}: HTTP ${response.status}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  assertChecksum(resource.url, content, resource.sha256);

  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, content);
  await fs.rename(temporaryPath, cachePath);
}

console.log(
  `Verified ${moduleCacheResources.length} cached network modules and ` +
    `${localModuleArtifacts.length} local WASM artifact${offline ? ' (offline)' : ''}.`,
);

async function readIfPresent(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertChecksum(label, content, expected) {
  const actual = sha256(content);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${label}: expected ${expected}, received ${actual}`);
  }
}
