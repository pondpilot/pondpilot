import { execFileSync } from 'child_process';

/* eslint-disable playwright/no-skipped-test -- Local Quack protocol smoke is gated because it downloads DuckDB CLI. */
import { expect, test } from '@playwright/test';

import {
  DUCKDB_BINARY,
  ensureDuckDBBinary,
  getFreePort,
  QUACK_E2E_TOKEN,
  QuackServerProcess,
  startQuackServer,
  stopQuackServer,
  waitForQuackServer,
} from './quack-test-utils';

test.describe('local DuckDB Quack protocol', () => {
  test.skip(
    process.env.RUN_QUACK_E2E !== 'true',
    'Set RUN_QUACK_E2E=true to run the local DuckDB Quack protocol smoke test',
  );

  let server: QuackServerProcess | undefined;
  let port: number;

  test.beforeEach(async () => {
    ensureDuckDBBinary();
    port = await getFreePort();
    server = startQuackServer(port);
    await waitForQuackServer(port, server);
  });

  test.afterEach(async () => {
    if (!server) return;
    stopQuackServer(server);
    server = undefined;
  });

  test('serves and queries data through Quack with DuckDB CLI v1.5.2', () => {
    const sql = `
INSTALL quack FROM core_nightly;
LOAD quack;
ATTACH 'quack:localhost:${port}' AS quack_remote (TOKEN '${QUACK_E2E_TOKEN}', DISABLE_SSL true);
SELECT name FROM quack_remote.main.quack_items WHERE id = 2;
`;

    const output = execFileSync(DUCKDB_BINARY, ['-c', sql], { encoding: 'utf8' });
    expect(output).toContain('beta');
  });
});
