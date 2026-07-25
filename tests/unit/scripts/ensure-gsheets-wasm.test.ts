import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

  it('accepts a custom artifact installed with a reviewed checksum', async () => {
    testRoot = await fs.mkdtemp(path.join(tmpdir(), 'pondpilot-gsheets-'));
    const scriptsDir = path.join(testRoot, 'scripts');
    const destinationPath = path.join(
      testRoot,
      'public',
      'duckdb-extensions',
      'gsheets',
      'gsheets.duckdb_extension.wasm',
    );
    const sourcePath = path.join(testRoot, 'reviewed-gsheets.wasm');
    const ensureScriptPath = path.join(scriptsDir, 'ensure-gsheets-wasm.mjs');
    const installScriptPath = path.join(scriptsDir, 'install-gsheets-wasm.mjs');
    const reviewedArtifact = 'reviewed custom artifact';
    const reviewedSha256 = createHash('sha256').update(reviewedArtifact).digest('hex');

    await fs.mkdir(scriptsDir, { recursive: true });
    await Promise.all([
      fs.copyFile(path.resolve('scripts/ensure-gsheets-wasm.mjs'), ensureScriptPath),
      fs.copyFile(path.resolve('scripts/install-gsheets-wasm.mjs'), installScriptPath),
      fs.writeFile(sourcePath, reviewedArtifact),
    ]);

    execFileSync(process.execPath, [installScriptPath], {
      env: {
        ...process.env,
        GSHEETS_WASM_SHA256: reviewedSha256,
        GSHEETS_WASM_SOURCE: sourcePath,
      },
    });
    execFileSync(process.execPath, [ensureScriptPath], {
      env: {
        ...process.env,
        GSHEETS_WASM_AUTO_BUILD: 'false',
        GSHEETS_WASM_FORCE_REBUILD: 'false',
        GSHEETS_WASM_SHA256: '',
        GSHEETS_WASM_SOURCE: '',
        PONDPILOT_SKIP_GSHEETS_BUILD: 'false',
      },
    });

    await expect(fs.readFile(destinationPath, 'utf8')).resolves.toBe(reviewedArtifact);
    await expect(
      fs.readFile(path.join(testRoot, '.gsheets-wasm.local.sha256'), 'utf8'),
    ).resolves.toBe(`${reviewedSha256}\n`);
  });

  it('rejects a custom artifact without a reviewed checksum before copying it', async () => {
    testRoot = await fs.mkdtemp(path.join(tmpdir(), 'pondpilot-gsheets-'));
    const scriptsDir = path.join(testRoot, 'scripts');
    const sourcePath = path.join(testRoot, 'unreviewed-gsheets.wasm');
    const installScriptPath = path.join(scriptsDir, 'install-gsheets-wasm.mjs');
    const destinationPath = path.join(
      testRoot,
      'public',
      'duckdb-extensions',
      'gsheets',
      'gsheets.duckdb_extension.wasm',
    );

    await fs.mkdir(scriptsDir, { recursive: true });
    await Promise.all([
      fs.copyFile(path.resolve('scripts/install-gsheets-wasm.mjs'), installScriptPath),
      fs.writeFile(sourcePath, 'unreviewed custom artifact'),
    ]);

    expect(() =>
      execFileSync(process.execPath, [installScriptPath], {
        env: {
          ...process.env,
          GSHEETS_WASM_SHA256: '',
          GSHEETS_WASM_SOURCE: sourcePath,
        },
        stdio: 'pipe',
      }),
    ).toThrow();
    await expect(fs.access(destinationPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts the bundled artifact when the local checksum record is malformed', async () => {
    testRoot = await fs.mkdtemp(path.join(tmpdir(), 'pondpilot-gsheets-'));
    const scriptsDir = path.join(testRoot, 'scripts');
    const destinationDir = path.join(testRoot, 'public', 'duckdb-extensions', 'gsheets');
    const destinationPath = path.join(destinationDir, 'gsheets.duckdb_extension.wasm');
    const ensureScriptPath = path.join(scriptsDir, 'ensure-gsheets-wasm.mjs');

    await Promise.all([
      fs.mkdir(scriptsDir, { recursive: true }),
      fs.mkdir(destinationDir, { recursive: true }),
    ]);
    await Promise.all([
      fs.copyFile(path.resolve('scripts/ensure-gsheets-wasm.mjs'), ensureScriptPath),
      fs.copyFile(
        path.resolve('public/duckdb-extensions/gsheets/gsheets.duckdb_extension.wasm'),
        destinationPath,
      ),
      fs.writeFile(path.join(testRoot, '.gsheets-wasm.local.sha256'), 'truncated'),
    ]);

    expect(() =>
      execFileSync(process.execPath, [ensureScriptPath], {
        env: {
          ...process.env,
          GSHEETS_WASM_AUTO_BUILD: 'false',
          GSHEETS_WASM_FORCE_REBUILD: 'false',
          GSHEETS_WASM_SOURCE: '',
          PONDPILOT_SKIP_GSHEETS_BUILD: 'false',
        },
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
