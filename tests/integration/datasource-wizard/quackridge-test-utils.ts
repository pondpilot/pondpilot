import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'child_process';
import { once } from 'events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createConnection } from 'net';
import { tmpdir } from 'os';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

import { getFreePort } from './quack-test-utils';

const POSTGRES_PASSWORD = 'quackridge-e2e-password';
const POSTGRES_USER = 'quackridge_reader';

export interface QuackRidgeHarness {
  binary: string;
  controlAddress: string;
  dir: string;
  dockerName: string;
  process: ChildProcessWithoutNullStreams;
  stdout: string[];
  stderr: string[];
}

export type PairingChallenge = { url: string; nonce: string; expires_at: string };
export type ManualPairing = { endpoint: string; token: string };

export type ControlResponse = {
  version: number;
  ok: boolean;
  error_code?: string;
  message?: string;
};

const runDocker = (args: string[]): string =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export async function startQuackRidgeHarness(): Promise<QuackRidgeHarness> {
  const binary = path.resolve(process.env.QUACKRIDGE_BINARY ?? '../quackridge/bin/quackridge');
  const extensionDir = path.resolve(process.env.QUACKRIDGE_EXTENSION_DIR ?? '');
  if (!existsSync(binary)) throw new Error(`QUACKRIDGE_BINARY does not exist: ${binary}`);
  if (!process.env.QUACKRIDGE_EXTENSION_DIR || !existsSync(extensionDir)) {
    throw new Error('QUACKRIDGE_EXTENSION_DIR must point to the pinned packaged extensions');
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'pondpilot-quackridge-'));
  const postgresPort = await getFreePort();
  const dockerName = `pondpilot-quackridge-${process.pid}-${postgresPort}`;
  runDocker([
    'run',
    '--detach',
    '--rm',
    '--name',
    dockerName,
    '-e',
    `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
    '-p',
    `127.0.0.1:${postgresPort}:5432`,
    'postgres:17-alpine',
  ]);
  const cleanupFailedStart = () => {
    try {
      runDocker(['rm', '--force', dockerName]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  const deadline = Date.now() + 30_000;
  let consecutiveReadyChecks = 0;
  while (Date.now() < deadline) {
    try {
      runDocker(['exec', dockerName, 'psql', '-U', 'postgres', '-c', 'SELECT 1']);
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks === 2) break;
      await delay(500);
    } catch {
      consecutiveReadyChecks = 0;
      await delay(250);
    }
  }
  if (consecutiveReadyChecks < 2) {
    cleanupFailedStart();
    throw new Error('Timed out waiting for the QuackRidge PostgreSQL fixture');
  }

  const fixtureSql = `
    CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}';
    CREATE TABLE customers(id integer PRIMARY KEY, name text NOT NULL);
    CREATE TABLE orders(id integer PRIMARY KEY, customer_id integer REFERENCES customers(id), amount decimal(12,2), placed_at timestamptz, note text);
    INSERT INTO customers VALUES (1, 'Ada'), (2, 'Grace');
    INSERT INTO orders VALUES (10, 1, 42.50, '2026-01-02T03:04:05Z', NULL), (11, 1, 7.25, '2026-02-03T04:05:06Z', 'rush'), (12, 2, 99.00, '2026-03-04T05:06:07Z', NULL);
    GRANT CONNECT ON DATABASE postgres TO ${POSTGRES_USER};
    GRANT USAGE ON SCHEMA public TO ${POSTGRES_USER};
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${POSTGRES_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${POSTGRES_USER};
  `;
  try {
    runDocker([
      'exec',
      dockerName,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      fixtureSql,
    ]);
  } catch (error) {
    cleanupFailedStart();
    throw error;
  }

  const configPath = path.join(dir, 'config.json');
  const controlAddress = path.join(dir, 'control.sock');
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        sources: [
          {
            id: 'warehouse',
            name: 'Warehouse',
            alias: 'warehouse',
            type: 'postgres',
            enabled: true,
            credential_ref: 'quackridge/source/warehouse',
            options: {
              host: '127.0.0.1',
              port: postgresPort,
              database: 'postgres',
              user: POSTGRES_USER,
              ssl_mode: 'disable',
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  const child = spawn(
    binary,
    [
      'serve',
      '--config',
      configPath,
      '--extensions',
      extensionDir,
      '--control',
      controlAddress,
      '--credential-provider',
      'environment',
      '--json',
    ],
    {
      stdio: 'pipe',
      env: {
        ...process.env,
        QUACKRIDGE_SECRET_QUACKRIDGE_SOURCE_WAREHOUSE: POSTGRES_PASSWORD,
      },
    },
  );
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on('data', (chunk) => stdout.push(String(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)));

  const readyDeadline = Date.now() + 30_000;
  while (Date.now() < readyDeadline) {
    if (child.exitCode !== null) {
      cleanupFailedStart();
      throw new Error(`QuackRidge exited (${child.exitCode}): ${stderr.join('')}`);
    }
    if (stdout.join('').includes('"endpoint"')) {
      return { binary, controlAddress, dir, dockerName, process: child, stdout, stderr };
    }
    await delay(100);
  }
  child.kill('SIGKILL');
  cleanupFailedStart();
  throw new Error(`Timed out waiting for QuackRidge readiness: ${stderr.join('')}`);
}

export function createPairingChallenge(
  harness: QuackRidgeHarness,
  origin: string,
  ttl = '2m',
): PairingChallenge {
  const output = execFileSync(
    harness.binary,
    ['pair', '--control', harness.controlAddress, '--origin', origin, '--ttl', ttl, '--json'],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as PairingChallenge;
}

export function getManualPairing(harness: QuackRidgeHarness): ManualPairing {
  const output = execFileSync(
    harness.binary,
    ['pair', '--control', harness.controlAddress, '--manual', '--json'],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as ManualPairing;
}

export async function callQuackRidgeControl(
  harness: QuackRidgeHarness,
  operation: string,
): Promise<ControlResponse> {
  return await new Promise((resolve, reject) => {
    const socket = createConnection(harness.controlAddress);
    let response = '';
    socket.setEncoding('utf8');
    socket.setTimeout(5_000, () => socket.destroy(new Error('QuackRidge control timed out')));
    socket.on('connect', () => socket.write(`${JSON.stringify({ version: 1, operation })}\n`));
    socket.on('data', (chunk) => {
      response += chunk;
    });
    socket.on('end', () => {
      try {
        resolve(JSON.parse(response) as ControlResponse);
      } catch (error) {
        reject(error);
      }
    });
    socket.on('error', reject);
  });
}

export async function stopQuackRidgeHarness(harness: QuackRidgeHarness): Promise<void> {
  harness.process.kill('SIGTERM');
  await Promise.race([once(harness.process, 'exit'), delay(10_000)]);
  if (harness.process.exitCode === null) {
    harness.process.kill('SIGKILL');
    await Promise.race([once(harness.process, 'exit'), delay(2_000)]);
  }
  try {
    runDocker(['rm', '--force', harness.dockerName]);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
}
