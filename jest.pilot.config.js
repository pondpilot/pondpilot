const baseConfig = require('./jest.config.js');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'vitest-pilot-baseline',
  roots: ['<rootDir>/tests/benchmarks/jest'],
  testEnvironment: 'jsdom',
  setupFiles: [],
  collectCoverageFrom: [
    'src/features/comparison/hooks/row-count-cache.ts',
    'src/features/schema-browser/components/schema-loading.tsx',
    'src/utils/duckdb/identifier.ts',
    'src/utils/sanitize-error.ts',
    'src/utils/sql-builder.ts',
  ],
  coverageDirectory:
    process.env.PILOT_COVERAGE_DIR || '<rootDir>/test-results/vitest-pilot/jest-coverage',
  coverageReporters: ['text-summary', 'json-summary'],
  coverageThreshold: undefined,
};
