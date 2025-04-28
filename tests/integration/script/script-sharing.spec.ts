import { expect, mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, spotlightTest);

test('Script sharing', async ({
  assertScriptExplorerItems,
  checkIfScriptExists,
  clickScriptNodeMenuItemByName,
  context,
  createScriptAndSwitchToItsTab,
  fillScript,
  openImportSharedScriptModalViaSpotlight,
  openScriptFromExplorer,
  page,
  scriptEditorContent,
}) => {
  // Add necessary permissions for clipboard access
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create a new script and switch to its tab
  await createScriptAndSwitchToItsTab();
  await fillScript('SELECT * FROM test');

  // Trigger the script sharing process
  await clickScriptNodeMenuItemByName('query.sql', 'Share script');

  const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  // Shallow check for the URL in the clipboard content, we do a full content check below
  expect(clipboardContent.includes('/shared-script/')).toBeTruthy();

  // Remove the script from the explorer
  await clickScriptNodeMenuItemByName('query.sql', 'Delete');

  expect(await checkIfScriptExists('query.sql')).toBeFalsy();

  // Start the import process
  await openImportSharedScriptModalViaSpotlight();

  const input = page.getByTestId('import-script-url-input');

  await input.fill(clipboardContent);
  await page.getByTestId('import-script-url-submit-button').click();

  // Now we should have one script in the explorer
  assertScriptExplorerItems(['query.sql']);

  // With the original content
  await expect(scriptEditorContent).toContainText('SELECT * FROM test');

  // Modify the content of the current script
  await fillScript('SELECT * FROM test2');

  // Import the script again
  await openImportSharedScriptModalViaSpotlight();
  await input.fill(clipboardContent);
  await page.getByTestId('import-script-url-submit-button').click();

  // We should have two scripts in the explorer
  assertScriptExplorerItems(['query.sql', 'query_1.sql']);

  // Check the content of the first script
  await openScriptFromExplorer('query.sql');
  await expect(scriptEditorContent).toContainText('SELECT * FROM test2');

  // Check the content of the second (imported) script
  await openScriptFromExplorer('query_1.sql');
  await expect(scriptEditorContent).toContainText('SELECT * FROM test');
});
