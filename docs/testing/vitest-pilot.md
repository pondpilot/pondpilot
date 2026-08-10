# Vitest migration pilot

Jest remains the production unit-test runner. This pilot measures Vitest 4 against a separate Jest
baseline without moving or rewriting the existing unit suites.

The repository also has a separate Jest jsdom/React Testing Library project for real component
renders. Run it with `yarn test:component`. This project remains available regardless of the Vitest
benchmark verdict.

The mirrored representative corpus covers:

- a pure production helper and TypeScript path aliases;
- fake timers and module state cleanup;
- a hoisted module mock with Jest `requireActual` / Vitest `importActual` partial-mock parity;
- a real TSX component render in jsdom through React Testing Library.

Run the individual pilots with:

```sh
yarn test:unit:jest:pilot
yarn test:unit:vitest:pilot
yarn test:unit:vitest:coverage
```

Run the comparison with:

```sh
yarn test:unit:vitest:benchmark
```

The benchmark starts each runner in a new process, disables both transform caches, alternates runner
order, and defaults to three iterations. It does not flush the operating-system file cache, and it
does not represent cold GitHub Actions performance for the full unit corpus. Set
`PILOT_BENCHMARK_RUNS` to increase the sample count.

The generated report is written to
`test-results/vitest-pilot/benchmark-report.json`. This directory is intentionally ignored by Git.
The report contains the raw durations, environment, semantic case-ID comparison, and coverage
deltas. A migration is eligible only when all of these gates pass:

- every expected case ID passes under both runners;
- the absolute delta for lines, statements, functions, and branches is at most 0.1 percentage
  points;
- Vitest is at least 30% faster by median duration.

Use `--enforce-migration-gate` when a non-zero exit is desired for any failed eligibility gate:

```sh
yarn node scripts/benchmark-vitest-pilot.mjs --enforce-migration-gate
```

Even a passing local report is not approval to migrate the existing suites. The final decision also
requires the same comparison on cold CI and 100% semantic parity across the entire Jest corpus.

## Recorded local result

The initial three-run pilot on 2026-08-10 used Node 24.14.0 on macOS arm64. Both runners passed all
9 case IDs, but Vitest's median was 1965.2 ms versus Jest's 2077.5 ms, a 5.4% improvement rather
than the required 30%. The maximum reported coverage delta was 58.89 percentage points because the
two transform/source-map pipelines counted the selected source differently.

Verdict: **NOT ELIGIBLE**. Keep Jest for the 73 production suites and use the separate Jest jsdom
project for component tests. A future Vitest evaluation must first establish comparable coverage
instrumentation and then repeat the benchmark on cold CI.
