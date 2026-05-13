import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

export const QUACK_E2E_TOKEN = 'pondpilot_test_token';

const DUCKDB_CLI_VERSION = 'v1.5.2';
const DUCKDB_CLI_URL = `https://github.com/duckdb/duckdb/releases/download/${DUCKDB_CLI_VERSION}/duckdb_cli-linux-amd64.zip`;

export const DUCKDB_BINARY = process.env.DUCKDB_BINARY || path.resolve('.local-bin/duckdb');

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
        const zipPath = path.join(binDir, 'duckdb_cli-linux-amd64.zip');
        execFileSync('curl', ['-fsSL', '-o', zipPath, DUCKDB_CLI_URL], { stdio: 'inherit' });
        execFileSync('unzip', ['-o', zipPath, '-d', binDir], { stdio: 'inherit' });
        execFileSync('chmod', ['+x', DUCKDB_BINARY]);
        if (existsSync(zipPath)) unlinkSync(zipPath);
      } finally {
        rmSync(lockDir, { recursive: true, force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      waitForDuckDBInstall(lockDir);
    }
  }

  execFileSync('chmod', ['+x', DUCKDB_BINARY]);
  const version = execFileSync(DUCKDB_BINARY, ['--version'], { encoding: 'utf8' });
  if (!version.includes(DUCKDB_CLI_VERSION)) {
    throw new Error(`Expected DuckDB CLI ${DUCKDB_CLI_VERSION}, got: ${version.trim()}`);
  }
  process.stdout.write(version);
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
INSTALL quack FROM core_nightly;
LOAD quack;
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
          `INSTALL quack FROM core_nightly;
LOAD quack;
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
