import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const source = process.env.GSHEETS_WASM_SOURCE;
const destDir = path.join(projectRoot, 'public', 'duckdb-extensions', 'gsheets');
const destPath = path.join(destDir, 'gsheets.duckdb_extension.wasm');
const expectedSha256 = process.env.GSHEETS_WASM_SHA256?.toLowerCase();

async function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(await fs.readFile(filePath));
  return hash.digest('hex');
}

async function main() {
  if (!source) {
    console.error('GSHEETS_WASM_SOURCE is not set.');
    console.error(
      'Usage: GSHEETS_WASM_SOURCE=/path/to/gsheets.duckdb_extension.wasm node scripts/install-gsheets-wasm.mjs',
    );
    process.exit(1);
  }

  try {
    await fs.access(source);
  } catch (_error) {
    console.error(`gsheets wasm not found at: ${source}`);
    process.exit(1);
  }

  const actualSha256 = await sha256(source);
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error(
      `gsheets wasm checksum mismatch: expected ${expectedSha256}, received ${actualSha256}`,
    );
  }

  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(source, destPath);
  console.log(`Copied gsheets wasm to ${destPath} (sha256: ${actualSha256})`);
}

main().catch((error) => {
  console.error('Failed to install gsheets wasm:', error);
  process.exit(1);
});
