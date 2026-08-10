import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const rootDir = resolve(import.meta.dirname, '..');
const outputRoot = join(rootDir, 'test-results', 'vitest-pilot');
const manifest = JSON.parse(
  readFileSync(join(rootDir, 'tests', 'benchmarks', 'vitest-pilot-manifest.json'), 'utf8'),
);
const enforceMigrationGate = process.argv.includes('--enforce-migration-gate');
const configuredRunCount = Number.parseInt(process.env.PILOT_BENCHMARK_RUNS || '3', 10);

if (!Number.isInteger(configuredRunCount) || configuredRunCount < 1) {
  throw new Error('PILOT_BENCHMARK_RUNS must be a positive integer');
}

const runnerDefinitions = {
  jest: {
    entrypoint: require.resolve('jest/bin/jest'),
    args: [
      '--config',
      'jest.pilot.config.js',
      '--runInBand',
      '--no-cache',
      '--coverage',
      '--json',
    ],
  },
  vitest: {
    entrypoint: join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'),
    args: ['run', '--config', 'vitest.pilot.config.ts', '--coverage', '--reporter=json'],
  },
};

function extractCaseResults(json) {
  const cases = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    if (typeof value.fullName === 'string' && typeof value.status === 'string') {
      const match = value.fullName.match(/\[pilot:([^\]]+)]/);
      if (match) cases.set(match[1], value.status);
    }

    Object.values(value).forEach(visit);
  };

  visit(json);
  return Object.fromEntries([...cases.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function runOnce(runnerName, iteration) {
  const runner = runnerDefinitions[runnerName];
  const runRoot = join(outputRoot, `run-${iteration + 1}`, runnerName);
  const resultFile = join(runRoot, 'results.json');
  const coverageDirectory = join(runRoot, 'coverage');
  mkdirSync(runRoot, { recursive: true });

  const outputArg = runnerName === 'jest' ? `--outputFile=${resultFile}` : `--outputFile=${resultFile}`;
  const startedAt = performance.now();
  const result = spawnSync(
    process.execPath,
    [runner.entrypoint, ...runner.args, outputArg],
    {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, PILOT_COVERAGE_DIR: coverageDirectory },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const durationMs = performance.now() - startedAt;

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`${runnerName} pilot run ${iteration + 1} exited with ${result.status}`);
  }

  const testResults = JSON.parse(readFileSync(resultFile, 'utf8'));
  const coverageSummary = JSON.parse(
    readFileSync(join(coverageDirectory, 'coverage-summary.json'), 'utf8'),
  );

  return {
    durationMs: Number(durationMs.toFixed(1)),
    cases: extractCaseResults(testResults),
    coverage: coverageSummary.total,
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function compareSemanticParity(runs) {
  const expected = [...manifest.caseIds].sort();
  const failures = [];

  for (const runnerName of Object.keys(runs)) {
    runs[runnerName].forEach((run, index) => {
      const actual = Object.keys(run.cases).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(`${runnerName} run ${index + 1} did not report the expected case IDs`);
      }
      for (const [caseId, status] of Object.entries(run.cases)) {
        if (status !== 'passed') {
          failures.push(`${runnerName} run ${index + 1}: ${caseId} was ${status}`);
        }
      }
    });
  }

  return { passed: failures.length === 0, failures };
}

function summarizeCoverage(runs) {
  const metrics = ['lines', 'statements', 'functions', 'branches'];
  const lastCoverage = Object.fromEntries(
    Object.entries(runs).map(([runnerName, runnerRuns]) => [
      runnerName,
      runnerRuns.at(-1).coverage,
    ]),
  );
  const deltas = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      Number(
        Math.abs(lastCoverage.jest[metric].pct - lastCoverage.vitest[metric].pct).toFixed(2),
      ),
    ]),
  );

  return {
    byRunner: lastCoverage,
    absoluteDeltaPoints: deltas,
    maximumDeltaPoints: Math.max(...Object.values(deltas)),
  };
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const runs = { jest: [], vitest: [] };
for (let iteration = 0; iteration < configuredRunCount; iteration += 1) {
  const order = iteration % 2 === 0 ? ['jest', 'vitest'] : ['vitest', 'jest'];
  for (const runnerName of order) {
    process.stdout.write(`Running ${runnerName} pilot ${iteration + 1}/${configuredRunCount}...\n`);
    runs[runnerName].push(runOnce(runnerName, iteration));
  }
}

const semanticParity = compareSemanticParity(runs);
const coverage = summarizeCoverage(runs);
const timing = {
  jest: {
    runsMs: runs.jest.map(({ durationMs }) => durationMs),
    medianMs: Number(median(runs.jest.map(({ durationMs }) => durationMs)).toFixed(1)),
  },
  vitest: {
    runsMs: runs.vitest.map(({ durationMs }) => durationMs),
    medianMs: Number(median(runs.vitest.map(({ durationMs }) => durationMs)).toFixed(1)),
  },
};
const speedupPercent = Number(
  ((1 - timing.vitest.medianMs / timing.jest.medianMs) * 100).toFixed(1),
);
const gates = {
  semanticParity: semanticParity.passed,
  coverageParity: coverage.maximumDeltaPoints <= manifest.maximumCoverageDeltaPoints,
  coldSpeedup:
    speedupPercent >= manifest.minimumSpeedupPercent && timing.vitest.medianMs > 0,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  },
  method: {
    runCount: configuredRunCount,
    processIsolation: true,
    transformCacheDisabled: true,
    operatingSystemCacheFlushed: false,
    alternatingRunnerOrder: true,
    note: 'This is a local representative pilot, not a cold CI measurement of all Jest suites.',
  },
  expectedCaseIds: manifest.caseIds,
  timing,
  speedupPercent,
  coverage,
  semanticParity,
  thresholds: {
    minimumSpeedupPercent: manifest.minimumSpeedupPercent,
    maximumCoverageDeltaPoints: manifest.maximumCoverageDeltaPoints,
  },
  gates,
  migrationEligible: Object.values(gates).every(Boolean),
};
const reportPath = join(outputRoot, 'benchmark-report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(`\nReport: ${reportPath}\n`);
process.stdout.write(`Jest median: ${timing.jest.medianMs} ms\n`);
process.stdout.write(`Vitest median: ${timing.vitest.medianMs} ms\n`);
process.stdout.write(`Vitest speedup: ${speedupPercent}%\n`);
process.stdout.write(`Coverage max delta: ${coverage.maximumDeltaPoints} points\n`);
process.stdout.write(`Migration gate: ${report.migrationEligible ? 'PASS' : 'NOT ELIGIBLE'}\n`);

if (!semanticParity.passed) {
  process.stderr.write(`${semanticParity.failures.join('\n')}\n`);
  process.exitCode = 1;
} else if (enforceMigrationGate && !report.migrationEligible) {
  process.exitCode = 1;
}
