import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const testRoots = ['tests/integration', 'tests/compatibility'];
const reviewPattern = /review-by:\s*(\d{4}-\d{2}-\d{2})/;
const today = new Date().toISOString().slice(0, 10);
const failures = [];

for (const testRoot of testRoots) {
  for (const file of await listTypeScriptFiles(path.join(projectRoot, testRoot))) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/test\.skip\(([\s\S]*?)\);/g)) {
      const review = match[0].match(reviewPattern);
      const relativeFile = path.relative(projectRoot, file);
      const line = source.slice(0, match.index).split('\n').length;
      if (!review) {
        failures.push(`${relativeFile}:${line} skip has no review-by: YYYY-MM-DD date`);
      } else if (review[1] < today) {
        failures.push(`${relativeFile}:${line} skip review date ${review[1]} has expired`);
      }
    }
  }
}

if (failures.length) {
  throw new Error(`Invalid Playwright skips:\n${failures.join('\n')}`);
}

console.log(`Verified Playwright skip review dates against ${today}.`);

async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listTypeScriptFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(entryPath);
  }
  return files;
}
