import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from '@jest/globals';

let testRoot: string | undefined;

afterEach(async () => {
  if (testRoot) {
    await fs.rm(testRoot, { force: true, recursive: true });
    testRoot = undefined;
  }
});

describe('ensure-gsheets-wasm', () => {
  it('copies a different same-size explicit artifact regardless of timestamps', async () => {
    testRoot = await fs.mkdtemp(path.join(tmpdir(), 'pondpilot-gsheets-'));
    const scriptsDir = path.join(testRoot, 'scripts');
    const destinationDir = path.join(testRoot, 'public', 'duckdb-extensions', 'gsheets');
    const sourcePath = path.join(testRoot, 'reviewed-gsheets.wasm');
    const destinationPath = path.join(destinationDir, 'gsheets.duckdb_extension.wasm');
    const scriptPath = path.join(scriptsDir, 'ensure-gsheets-wasm.mjs');

    await Promise.all([
      fs.mkdir(scriptsDir, { recursive: true }),
      fs.mkdir(destinationDir, { recursive: true }),
    ]);
    await Promise.all([
      fs.copyFile(path.resolve('scripts/ensure-gsheets-wasm.mjs'), scriptPath),
      fs.writeFile(sourcePath, 'reviewed'),
      fs.writeFile(destinationPath, 'outdated'),
    ]);

    const now = new Date();
    const older = new Date(now.getTime() - 60_000);
    await fs.utimes(sourcePath, older, older);
    await fs.utimes(destinationPath, now, now);

    execFileSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        GSHEETS_WASM_SOURCE: sourcePath,
        PONDPILOT_SKIP_GSHEETS_BUILD: 'false',
      },
    });

    await expect(fs.readFile(destinationPath, 'utf8')).resolves.toBe('reviewed');
  });
});
