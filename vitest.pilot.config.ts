import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: 'vitest-pilot',
    include: ['tests/benchmarks/vitest/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: false,
    fileParallelism: false,
    maxWorkers: 1,
    mockReset: true,
    restoreMocks: true,
    cache: false,
    coverage: {
      provider: 'v8',
      include: [
        'src/features/comparison/hooks/row-count-cache.ts',
        'src/features/schema-browser/components/schema-loading.tsx',
        'src/utils/duckdb/identifier.ts',
        'src/utils/sanitize-error.ts',
        'src/utils/sql-builder.ts',
      ],
      reportsDirectory:
        process.env.PILOT_COVERAGE_DIR || 'test-results/vitest-pilot/vitest-coverage',
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
