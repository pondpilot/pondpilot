import { test as base } from '@playwright/test';
import path from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';

interface TestTmp {
  /**
   * Join paths with the test temporary directory.
   * @param paths - The paths to join.
   * @returns The resulting path.
   */
  join: (...paths: string[]) => string;
}

const tmpRoot = path.join('tests', 'test-tmp');

const testTmp = {
  join: (...paths: string[]) => path.join(tmpRoot, ...paths),
};

type TestTmpFixtures = {
  testTmp: TestTmp;
};

export const test = base.extend<TestTmpFixtures>({
  /* eslint-disable-next-line no-empty-pattern */
  testTmp: async ({}, use) => {
    // Clear tmpRoot before each test
    if (existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true });
    }
    mkdirSync(tmpRoot, { recursive: true });

    await use(testTmp);
  },
});
