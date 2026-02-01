import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const source = process.env.READ_STAT_WASM_SOURCE;
const destDir = path.join(projectRoot, 'public', 'duckdb-extensions', 'read_stat');
const destPath = path.join(destDir, 'read_stat.duckdb_extension.wasm');

async function main() {
  if (!source) {
    console.error('READ_STAT_WASM_SOURCE is not set.');
    console.error('Usage: READ_STAT_WASM_SOURCE=/path/to/read_stat.duckdb_extension.wasm node scripts/install-readstat-wasm.mjs');
    process.exit(1);
  }

  try {
    await fs.access(source);
  } catch (error) {
    console.error(`read_stat wasm not found at: ${source}`);
    process.exit(1);
  }

  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(source, destPath);
  console.log(`Copied read_stat wasm to ${destPath}`);
}

main().catch((error) => {
  console.error('Failed to install read_stat wasm:', error);
  process.exit(1);
});
