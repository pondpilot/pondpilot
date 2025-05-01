import { existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';

import { test as base } from '@playwright/test';

interface TestTmp {
  /**
   * Join paths with the test temporary directory.
   * @param paths - The paths to join.
   * @returns The resulting path.
   */
  join: (...paths: string[]) => string;
}

const root = path.join('tests', 'test-tmp', 'integration');

const getTestTmp = (testDir: string): TestTmp => ({
  join: (...paths: string[]) => path.join(testDir, ...paths),
});

type TestTmpFixtures = {
  testTmp: TestTmp;
};

export const test = base.extend<TestTmpFixtures>({
  /* eslint-disable-next-line no-empty-pattern */
  testTmp: async ({}, use, testInfo) => {
    // Before each test, clean up its directory
    const testDir = path.join(root, `test-${testInfo.testId}`);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    await use(getTestTmp(testDir));
  },
});

/* eslint-disable-next-line no-empty-pattern */
test.beforeAll(async ({}, testInfo) => {
  // Before all tests, clean up the root directory
  if (testInfo.retry === 0) {
    // Do not remove on retries
    if (existsSync(root)) {
      rmSync(root, { recursive: true });
    }
  }
});
