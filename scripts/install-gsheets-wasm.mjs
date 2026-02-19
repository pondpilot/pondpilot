import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const source = process.env.GSHEETS_WASM_SOURCE;
const destDir = path.join(projectRoot, 'public', 'duckdb-extensions', 'gsheets');
const destPath = path.join(destDir, 'gsheets.duckdb_extension.wasm');

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

  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(source, destPath);
  console.log(`Copied gsheets wasm to ${destPath}`);
}

main().catch((error) => {
  console.error('Failed to install gsheets wasm:', error);
  process.exit(1);
});
