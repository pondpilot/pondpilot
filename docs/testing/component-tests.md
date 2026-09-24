# Component tests

Unit tests in `tests/unit` run in Jest's `node` environment. Component tests that render React
components into a DOM live in `tests/component` and run in a separate Jest project with jsdom and
React Testing Library:

```sh
yarn test:component
```

The project reuses the path aliases and module mocks from `jest.config.js`
(see `jest.component.config.js`) and runs in CI after the unit tests. Browser-specific behavior such
as layout geometry, focus, clipboard, and DuckDB-WASM stays in the Playwright integration suite.

## Vitest pilot (2026-08-10)

Before this project was added, a pilot compared Vitest 4 with Jest 30 on a mirrored representative
corpus (pure helpers, fake timers, partial module mocks, and a TSX render in jsdom 26.1). Both runners
passed all 9 cases, but Vitest was only 7.3% faster by median (1991 ms vs 2147 ms, three local runs
on Node 24 / macOS arm64) against a required 30%, and per-file coverage totals differed by up to
58.9 percentage points because the two coverage pipelines instrument sources differently.

Verdict: not eligible for migration. Jest stays the unit-test runner. A future evaluation should
first make coverage instrumentation comparable and then measure the full unit corpus on cold CI.
The pilot code (mirrored suites, benchmark script, and Vitest config) is preserved in the history of
PR #340 (commit `a6ba51d`).
