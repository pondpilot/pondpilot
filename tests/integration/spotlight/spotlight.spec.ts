import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(baseTest, spotlightTest, tabTest, scriptEditorTest);

test('Long action names are truncated in spotlight results', async ({ page, openSpotlight }) => {
  // Open spotlight menu
  await openSpotlight();

  // Create a long text of exactly 75 characters
  const longActionName =
    'ThisIsAVeryLongActionNameThatShouldBeTruncatedInTheSpotlightSearchResults12';
  expect(longActionName.length).toBe(75);

  // Check if at least one spotlight action is visible
  await expect(page.locator('[data-testid^="spotlight-action-"]').first()).toBeVisible();

  // Find all spotlight actions
  const actionIds = await page.evaluate(() => {
    const actions = Array.from(document.querySelectorAll('[data-testid^="spotlight-action-"]'));
    return actions.map((action) => action.getAttribute('data-testid'));
  });
  expect(actionIds.length).toBeGreaterThan(0);

  // Test each action
  for (const actionId of actionIds) {
    // Find the truncatable element for this action
    const truncatableElement = page.locator(`[data-testid="${actionId}"] p[data-truncate="end"]`);

    // Make sure the element exists before continuing
    const elementExists = (await truncatableElement.count()) > 0;

    // eslint-disable-next-line playwright/no-conditional-in-test
    if (!elementExists) {
      continue;
    }

    await expect(truncatableElement).toBeVisible();

    // Modify the text content of the specific element
    await page.evaluate(
      ({ selector, longActionName: name }) => {
        const element = document.querySelector(selector);
        if (element) {
          element.textContent = name;
        }
      },
      {
        selector: `[data-testid="${actionId}"] p[data-truncate="end"]`,
        longActionName,
      },
    );

    // Verify the text content was updated
    await expect(truncatableElement).toHaveText(longActionName);

    // Check if text is truncated with ellipsis
    const isTruncatedWithEllipsis = await truncatableElement.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const hasEllipsis = style.textOverflow === 'ellipsis';
      const isOverflowing = element.scrollWidth > element.clientWidth;
      return hasEllipsis && isOverflowing;
    });

    // Assert that the text is properly truncated
    expect(isTruncatedWithEllipsis).toBeTruthy();
  }
});

test('Create scripts using spotlight menu', async ({
  createScriptViaSpotlight,
  fillScript,
  switchToTab,
  getScriptEditorContent,
}) => {
  // Create first script via spotlight
  await createScriptViaSpotlight();
  await fillScript('select 3 as spotlight_query_1');

  // Create second script via spotlight
  await createScriptViaSpotlight();
  await fillScript('select 4 as spotlight_query_2');

  // Switch to first script and verify content
  await switchToTab('query');
  await expect(await getScriptEditorContent()).toContainText('select 3 as spotlight_query_1');

  // Switch to second script and verify content
  await switchToTab('query_1');
  await expect(await getScriptEditorContent()).toContainText('select 4 as spotlight_query_2');
});
