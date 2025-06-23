import { mergeTests } from '@playwright/test';

import { test as notificationTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as storageTest } from '../fixtures/storage';

const test = mergeTests(
  baseTest,
  scriptEditorTest,
  scriptExplorerTest,
  storageTest,
  notificationTest,
);

test.describe('AI Assistant Error Context', () => {
  test.beforeEach(async ({ createScriptAndSwitchToItsTab }) => {
    await createScriptAndSwitchToItsTab();
  });

  // Tests removed as requested
});
