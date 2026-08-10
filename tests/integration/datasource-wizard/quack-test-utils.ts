import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';
import { gunzipSync } from 'zlib';

export const QUACK_E2E_TOKEN = 'pondpilot_test_token';

const DUCKDB_CLI_VERSION = 'v1.5.2';
const DUCKDB_CLI_URL = `https://install.duckdb.org/${DUCKDB_CLI_VERSION}/duckdb_cli-linux-amd64.gz`;
const DUCKDB_CLI_GZIP_SHA256 = '7b0130422ee15c4c07f85ab75c0e3daf19b912b762258d1724c30f27964fb021';
const DUCKDB_BINARY_SHA256 = 'e7d04a9ca6ef1b4cadb0fff5dad19b1995915e5881b91f861fc60b9d7564503b';
const QUACK_EXTENSION_URL =
  'https://nightly-extensions.duckdb.org/v1.5.2/linux_amd64/quack.duckdb_extension.gz';
const QUACK_EXTENSION_GZIP_SHA256 =
  '820011bff140fd1e00c3e3977170a9f8599ac7dceb10d8ac312d4b7683307709';
const QUACK_EXTENSION_SHA256 = '1633c910a2d7d2779878e5c77e1ddd07091ea5c1dc6a38192e70e70395774f4a';

export const DUCKDB_BINARY = process.env.DUCKDB_BINARY || path.resolve('.local-bin/duckdb');
export const QUACK_EXTENSION = path.resolve('.local-bin/quack.duckdb_extension');
export const QUACK_LOAD_SQL = `LOAD '${QUACK_EXTENSION.replaceAll("'", "''")}';`;

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local TCP port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function sleepSync(ms: number): void {
  // Portable synchronous sleep: Atomics.wait on a SharedArrayBuffer blocks the
  // main thread for `ms` without relying on platform-specific shell utilities.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForDuckDBInstall(lockDir: string, timeoutMs = 60_000): void {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!existsSync(lockDir) && existsSync(DUCKDB_BINARY)) return;
    // Synchronous sleep so this helper can be used from the synchronous
    // ensureDuckDBBinary() bootstrap path.
    sleepSync(250);
  }
  throw new Error(`Timed out waiting for DuckDB CLI installation lock: ${lockDir}`);
}

export function ensureDuckDBBinary(): void {
  if (!existsSync(DUCKDB_BINARY)) {
    if (process.env.DUCKDB_BINARY) {
      throw new Error(`DUCKDB_BINARY does not exist: ${DUCKDB_BINARY}`);
    }

    const binDir = path.dirname(DUCKDB_BINARY);
    const lockDir = path.join(binDir, 'duckdb-install.lock');

    try {
      mkdirSync(binDir, { recursive: true });
      mkdirSync(lockDir);
      try {
        const gzipPath = path.join(binDir, 'duckdb_cli-linux-amd64.gz');
        execFileSync('curl', ['-fsSL', '-o', gzipPath, DUCKDB_CLI_URL], { stdio: 'inherit' });
        assertFileChecksum(gzipPath, DUCKDB_CLI_GZIP_SHA256);
        const binary = gunzipSync(readFileSync(gzipPath));
        assertChecksum('decompressed DuckDB CLI', binary, DUCKDB_BINARY_SHA256);
        writeFileSync(DUCKDB_BINARY, binary);
        execFileSync('chmod', ['+x', DUCKDB_BINARY]);
        assertFileChecksum(DUCKDB_BINARY, DUCKDB_BINARY_SHA256);
        if (existsSync(gzipPath)) unlinkSync(gzipPath);
      } finally {
        rmSync(lockDir, { recursive: true, force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      waitForDuckDBInstall(lockDir);
    }
  }

  execFileSync('chmod', ['+x', DUCKDB_BINARY]);
  assertFileChecksum(DUCKDB_BINARY, DUCKDB_BINARY_SHA256);
  const version = execFileSync(DUCKDB_BINARY, ['--version'], { encoding: 'utf8' });
  if (!version.includes(DUCKDB_CLI_VERSION)) {
    throw new Error(`Expected DuckDB CLI ${DUCKDB_CLI_VERSION}, got: ${version.trim()}`);
  }
  process.stdout.write(version);
  ensureQuackExtension();
}

function ensureQuackExtension(): void {
  if (!existsSync(QUACK_EXTENSION)) {
    const gzipPath = `${QUACK_EXTENSION}.gz`;
    execFileSync('curl', ['-fsSL', '-o', gzipPath, QUACK_EXTENSION_URL], { stdio: 'inherit' });
    assertFileChecksum(gzipPath, QUACK_EXTENSION_GZIP_SHA256);
    const extension = gunzipSync(readFileSync(gzipPath));
    assertChecksum('decompressed Quack extension', extension, QUACK_EXTENSION_SHA256);
    writeFileSync(QUACK_EXTENSION, extension);
    unlinkSync(gzipPath);
  }
  assertFileChecksum(QUACK_EXTENSION, QUACK_EXTENSION_SHA256);
}

function assertFileChecksum(filePath: string, expected: string): void {
  assertChecksum(filePath, readFileSync(filePath), expected);
}

function assertChecksum(label: string, content: Buffer, expected: string): void {
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${label}: expected ${expected}, received ${actual}`);
  }
}

export interface QuackServerProcess {
  proc: ChildProcessWithoutNullStreams;
  dir: string;
  stdout: string[];
  stderr: string[];
}

export function startQuackServer(port: number): QuackServerProcess {
  const dir = mkdtempSync(path.join(tmpdir(), 'pondpilot-quack-'));
  const dbPath = path.join(dir, 'quack-server.duckdb');
  const proc = spawn(DUCKDB_BINARY, [dbPath], { stdio: 'pipe' });
  const stdout: string[] = [];
  const stderr: string[] = [];
  proc.stdout.on('data', (chunk) => stdout.push(String(chunk)));
  proc.stderr.on('data', (chunk) => stderr.push(String(chunk)));

  proc.stdin.write(`
${QUACK_LOAD_SQL}
CREATE TABLE IF NOT EXISTS quack_items(id INTEGER, name VARCHAR);
DELETE FROM quack_items;
INSERT INTO quack_items VALUES (1, 'alpha'), (2, 'beta');
CALL quack_serve('quack:0.0.0.0:${port}', token='${QUACK_E2E_TOKEN}', allow_other_hostname=>true);
`);

  return { proc, dir, stdout, stderr };
}

export async function waitForQuackServer(
  port: number,
  server?: QuackServerProcess,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (server && server.proc.exitCode !== null) {
      throw new Error(
        `Local DuckDB Quack server exited with code ${server.proc.exitCode}. ` +
          `stderr: ${server.stderr.join('').trim()}`,
      );
    }

    try {
      const output = execFileSync(
        DUCKDB_BINARY,
        [
          '-c',
          `${QUACK_LOAD_SQL}
ATTACH 'quack:localhost:${port}' AS quack_remote (TOKEN '${QUACK_E2E_TOKEN}', DISABLE_SSL true);
SELECT name FROM quack_remote.main.quack_items WHERE id = 2;`,
        ],
        { encoding: 'utf8' },
      );
      if (output.includes('beta')) return;
      lastError = new Error(`Unexpected Quack readiness output: ${output}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  const stderr = server?.stderr.join('').trim();
  const stderrMessage = stderr ? `. Server stderr: ${stderr}` : '';
  throw new Error(
    `Timed out waiting for local DuckDB Quack server on port ${port}: ${message}${stderrMessage}`,
  );
}

export function stopQuackServer(server: QuackServerProcess): void {
  server.proc.kill();
  rmSync(server.dir, { recursive: true, force: true });
}
