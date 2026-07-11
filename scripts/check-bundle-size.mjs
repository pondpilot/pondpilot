import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const assetsDirectory = path.resolve('dist/assets');
const megabyte = 1024 * 1024;
const maxChunkSize = 4 * megabyte;
const maxTotalSize = 8 * megabyte;

const formatSize = (bytes) => `${(bytes / megabyte).toFixed(2)} MB`;

let assetNames;

try {
  assetNames = await readdir(assetsDirectory);
} catch (error) {
  console.error(`Could not read ${assetsDirectory}: ${error.message}`);
  process.exit(1);
}

const chunks = await Promise.all(
  assetNames
    .filter((name) => name.endsWith('.js'))
    .map(async (name) => ({
      name,
      size: (await stat(path.join(assetsDirectory, name))).size,
    })),
);

if (chunks.length === 0) {
  console.error(`No JavaScript chunks found in ${assetsDirectory}`);
  process.exit(1);
}

chunks.sort((left, right) => right.size - left.size);

const nameWidth = Math.max('Chunk'.length, ...chunks.map(({ name }) => name.length));
const totalSize = chunks.reduce((total, { size }) => total + size, 0);

console.log('JavaScript bundle sizes');
console.log(`${'Chunk'.padEnd(nameWidth)}  Size`);
console.log(`${'-'.repeat(nameWidth)}  --------`);

for (const chunk of chunks) {
  console.log(`${chunk.name.padEnd(nameWidth)}  ${formatSize(chunk.size).padStart(8)}`);
}

console.log(`${'-'.repeat(nameWidth)}  --------`);
console.log(`${'Total'.padEnd(nameWidth)}  ${formatSize(totalSize).padStart(8)}`);

const oversizedChunks = chunks.filter(({ size }) => size > maxChunkSize);

if (oversizedChunks.length > 0 || totalSize > maxTotalSize) {
  console.error('\nBundle size budget exceeded:');

  for (const chunk of oversizedChunks) {
    console.error(
      `- ${chunk.name} is ${formatSize(chunk.size)} (limit: ${formatSize(maxChunkSize)})`,
    );
  }

  if (totalSize > maxTotalSize) {
    console.error(
      `- Total JavaScript is ${formatSize(totalSize)} (limit: ${formatSize(maxTotalSize)})`,
    );
  }

  process.exitCode = 1;
}
