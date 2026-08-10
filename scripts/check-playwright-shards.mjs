import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const shardCount = 3;

const unsharded = listTestIds();
const shards = Array.from({ length: shardCount }, (_, index) =>
  listTestIds(`${index + 1}/${shardCount}`),
);
const occurrences = new Map();

for (const [index, shard] of shards.entries()) {
  for (const id of shard) {
    const owners = occurrences.get(id) ?? [];
    owners.push(index + 1);
    occurrences.set(id, owners);
  }
}

const duplicates = [...occurrences].filter(([, owners]) => owners.length > 1);
const union = new Set(occurrences.keys());
const missing = [...unsharded].filter((id) => !union.has(id));
const unexpected = [...union].filter((id) => !unsharded.has(id));

if (duplicates.length || missing.length || unexpected.length) {
  const details = [
    duplicates.length
      ? `overlap: ${duplicates
          .slice(0, 10)
          .map(([id, owners]) => `${id} (${owners.join(',')})`)
          .join(', ')}`
      : '',
    missing.length ? `missing: ${missing.slice(0, 10).join(', ')}` : '',
    unexpected.length ? `unexpected: ${unexpected.slice(0, 10).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  throw new Error(`Playwright shard partition is invalid.\n${details}`);
}

console.log(
  `Verified ${unsharded.size} Chromium test IDs across ${shardCount} non-overlapping shards ` +
    `(${shards.map((shard) => shard.size).join(' + ')}).`,
);

function listTestIds(shard) {
  const args = [playwrightCli, 'test', '--list', '--project=chromium', '--reporter=json'];
  if (shard) args.push(`--shard=${shard}`);

  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  });

  if (result.status !== 0) {
    throw new Error(
      `Unable to list Playwright tests${shard ? ` for shard ${shard}` : ''}:\n${result.stderr}`,
    );
  }

  const report = JSON.parse(result.stdout);
  const ids = new Set();
  collectIds(report.suites, ids);
  return ids;
}

function collectIds(suites, ids) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) ids.add(`${test.projectName}:${spec.id}`);
    }
    collectIds(suite.suites, ids);
  }
}
