import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [serialArgument, shardedArgument] = process.argv.slice(2);
if (!serialArgument || !shardedArgument) {
  throw new Error('Usage: check-playwright-parity.mjs <serial-results.xml> <sharded-results.xml>');
}

const serial = await readJUnit(serialArgument);
const sharded = await readJUnit(shardedArgument);
const failures = [];

compareKeys(serial.tests, sharded.tests, 'test IDs');
for (const [id, serialTest] of serial.tests) {
  const shardedTest = sharded.tests.get(id);
  if (shardedTest && serialTest.outcome !== shardedTest.outcome) {
    failures.push(`${id}: serial=${serialTest.outcome}, sharded=${shardedTest.outcome}`);
  }
}
if (serial.skipped !== sharded.skipped) {
  failures.push(`skip count differs: serial=${serial.skipped}, sharded=${sharded.skipped}`);
}
if (serial.flaky !== sharded.flaky) {
  failures.push(`flaky retry count differs: serial=${serial.flaky}, sharded=${sharded.flaky}`);
}

if (failures.length) {
  throw new Error(`Serial/sharded Playwright parity failed:\n${failures.join('\n')}`);
}

console.log(
  `Verified ${serial.tests.size} serial/sharded test outcomes ` +
    `(${serial.skipped} skipped, ${serial.flaky} flaky retries).`,
);

async function readJUnit(argument) {
  const filePath = path.resolve(argument);
  const xml = await readFile(filePath, 'utf8');
  const tests = new Map();
  let skipped = 0;
  let flaky = 0;

  for (const match of xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
    const attributes = parseAttributes(match[1]);
    const body = match[2];
    const id = `${decodeXml(attributes.classname ?? '')}::${decodeXml(attributes.name ?? '')}`;
    if (tests.has(id)) throw new Error(`Duplicate test ID in ${filePath}: ${id}`);
    const outcome = /<(?:failure|error)\b/.test(body)
      ? 'failed'
      : /<skipped\b/.test(body)
        ? 'skipped'
        : 'passed';
    if (outcome === 'skipped') skipped += 1;
    flaky += [...body.matchAll(/<flakyFailure\b/g)].length;
    tests.set(id, { outcome });
  }

  if (!tests.size) throw new Error(`No test cases found in ${filePath}`);
  return { tests, skipped, flaky };
}

function parseAttributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function compareKeys(left, right, label) {
  const missing = [...left.keys()].filter((key) => !right.has(key));
  const unexpected = [...right.keys()].filter((key) => !left.has(key));
  if (missing.length)
    failures.push(`${label} missing from shards: ${missing.slice(0, 10).join(', ')}`);
  if (unexpected.length) {
    failures.push(`${label} only in shards: ${unexpected.slice(0, 10).join(', ')}`);
  }
}
