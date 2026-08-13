import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PINNED_TAG = 'v0.2.0-rc.3';
const FILES = [
  'error-codes.json',
  'identity.schema.json',
  'metadata.schema.json',
  'pairing.schema.json',
  'release-manifest.schema.json',
  'fixtures/identity.invalid.json',
  'fixtures/identity.valid.json',
  'fixtures/metadata.invalid.json',
  'fixtures/metadata.valid.json',
  'fixtures/pairing.invalid.json',
  'fixtures/pairing.valid.json',
];

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.resolve(
  process.env.QUACKRIDGE_PROTOCOL_SOURCE ??
    path.join(repositoryRoot, '..', 'quackridge', 'protocol', 'v2'),
);
const destinationRoot = path.join(repositoryRoot, 'src', 'protocol', 'quackridge', 'v2');
const checkOnly = process.argv.includes('--check');

const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalizeJson = (value) => `${JSON.stringify(JSON.parse(value), null, 2)}\n`;

const hashes = {};
const changed = [];

for (const relativePath of FILES) {
  const source = normalizeJson(await readFile(path.join(sourceRoot, relativePath), 'utf8'));
  hashes[relativePath] = digest(source);
  const destination = path.join(destinationRoot, relativePath);
  let current = null;
  try {
    current = await readFile(destination, 'utf8');
  } catch {
    // A missing destination is expected on the first sync.
  }

  if (current !== source) {
    changed.push(relativePath);
    if (!checkOnly) {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, source);
    }
  }
}

const pin = `${JSON.stringify(
  {
    source: 'github.com/pondpilot/quackridge',
    tag: PINNED_TAG,
    protocol: 2,
    files: hashes,
  },
  null,
  2,
)}\n`;
const pinPath = path.join(destinationRoot, 'pin.json');
let currentPin = null;
try {
  currentPin = await readFile(pinPath, 'utf8');
} catch {
  // A missing pin is expected on the first sync.
}
if (currentPin !== pin) {
  changed.push('pin.json');
  if (!checkOnly) {
    await mkdir(destinationRoot, { recursive: true });
    await writeFile(pinPath, pin);
  }
}

if (checkOnly && changed.length > 0) {
  console.error(`QuackRidge protocol drift detected (${PINNED_TAG}): ${changed.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(
    changed.length > 0
      ? `Synced QuackRidge protocol ${PINNED_TAG}: ${changed.join(', ')}`
      : `QuackRidge protocol ${PINNED_TAG} is current`,
  );
}
