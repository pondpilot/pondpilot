import { expect, mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, spotlightTest);

test('Script sharing', async ({
  createScriptAndSwitchToItsTab,
  page,
  context,
  scriptEditorContent,
  fillScript,
  clickScriptNodeMenuItemByName,
  checkIfScriptExists,
  openImportSharedScriptModalViaSpotlight,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createScriptAndSwitchToItsTab();
  await fillScript('SELECT * FROM test');
  await clickScriptNodeMenuItemByName('query.sql', 'Share script');

  const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  expect(clipboardContent.includes('/shared-script/')).toBeTruthy();

  await clickScriptNodeMenuItemByName('query.sql', 'Delete');

  expect(await checkIfScriptExists('query.sql')).toBeFalsy();

  await openImportSharedScriptModalViaSpotlight();

  const input = page.getByTestId('import-script-url-input');

  await input.fill(clipboardContent);
  await page.getByTestId('import-script-url-submit-button').click();

  await expect(scriptEditorContent).toContainText('SELECT * FROM test');
});
