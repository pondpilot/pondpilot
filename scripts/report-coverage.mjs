import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const outputPath = path.resolve(args.output || 'coverage/pr-summary.md');
const summaryPath = path.resolve('coverage/coverage-summary.json');
const lcovPath = path.resolve('coverage/lcov.info');
const changedLineThreshold = 80;

const formatPercent = (value) => `${Number(value).toFixed(2)}%`;

const normalizeSourcePath = (sourcePath) => {
  const absolutePath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(repositoryRoot, sourcePath);
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
};

const parseLcov = (contents) => {
  const files = new Map();
  let currentFile;

  for (const line of contents.split('\n')) {
    if (line.startsWith('SF:')) {
      currentFile = normalizeSourcePath(line.slice(3));
      files.set(currentFile, new Map());
      continue;
    }

    if (line.startsWith('DA:') && currentFile) {
      const [lineNumber, hits] = line.slice(3).split(',').map(Number);
      files.get(currentFile).set(lineNumber, hits);
    }
  }

  return files;
};

const parseChangedLines = (diff) => {
  const changedLines = new Map();
  let currentFile;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      continue;
    }
    if (line === '+++ /dev/null') {
      currentFile = undefined;
      continue;
    }

    if (!line.startsWith('@@') || !currentFile) continue;
    const match = line.match(/\+(\d+)(?:,(\d+))?/);
    if (!match) continue;

    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    const lines = changedLines.get(currentFile) || new Set();
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset);
    changedLines.set(currentFile, lines);
  }

  return changedLines;
};

const getChangedLineCoverage = (baseSha, lcov) => {
  if (!baseSha) return undefined;

  let diff;
  try {
    diff = execFileSync(
      'git',
      ['diff', '--unified=0', '--diff-filter=ACMR', baseSha, 'HEAD', '--', 'src'],
      { encoding: 'utf8' },
    );
  } catch (error) {
    console.warn(`Could not calculate changed-line coverage: ${error.message}`);
    return undefined;
  }

  let covered = 0;
  let instrumented = 0;
  for (const [file, lines] of parseChangedLines(diff)) {
    const fileCoverage = lcov.get(file);
    if (!fileCoverage) continue;

    for (const line of lines) {
      if (!fileCoverage.has(line)) continue;
      instrumented += 1;
      if (fileCoverage.get(line) > 0) covered += 1;
    }
  }

  if (instrumented === 0) return { covered: 0, instrumented: 0, percent: 100 };
  return { covered, instrumented, percent: (covered / instrumented) * 100 };
};

let markdown;
if (!existsSync(summaryPath) || !existsSync(lcovPath)) {
  markdown = [
    '## Unit coverage',
    '',
    'Coverage output was not produced. Check the unit-test step for the underlying failure.',
    '',
  ].join('\n');
} else {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')).total;
  const lcov = parseLcov(readFileSync(lcovPath, 'utf8'));
  const changed = getChangedLineCoverage(args.base, lcov);

  const rows = ['statements', 'branches', 'functions', 'lines'].map((metric) => {
    const result = summary[metric];
    return `| ${metric} | ${formatPercent(result.pct)} | ${result.covered} / ${result.total} |`;
  });

  const changedSummary = changed
    ? changed.instrumented === 0
      ? 'Changed-line coverage: no changed executable lines were found.'
      : `Changed executable lines: **${formatPercent(changed.percent)}** (${changed.covered} / ${changed.instrumented}). Informational target: ${changedLineThreshold}%. ${changed.percent >= changedLineThreshold ? 'PASS' : 'BELOW TARGET'}.`
    : 'Changed-line coverage is unavailable because this run has no pull-request base SHA.';

  markdown = [
    '## Unit coverage',
    '',
    '| Metric | Coverage | Covered / total |',
    '| --- | ---: | ---: |',
    ...rows,
    '',
    changedSummary,
    '',
    'The changed-line target is informational during the 10-PR observation period. Existing global Jest thresholds remain enforced.',
    '',
  ].join('\n');
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown);
process.stdout.write(markdown);
