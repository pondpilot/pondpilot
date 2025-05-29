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

type TestTmpFixtures = {
  testTmp: TestTmp;
};

export const test = base.extend<TestTmpFixtures>({
  testTmp: async ({}, use, testInfo) => {
    await use({
      join: (...paths: string[]) => testInfo.outputPath(...paths),
    });
  },
});
