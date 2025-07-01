import { mergeTests, expect, Browser, BrowserContext, Page } from '@playwright/test';

import { test as aiChatTest } from '../fixtures/ai-chat';
import { test as pageTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(pageTest, aiChatTest, tabTest);

test.describe('AI Chat Multi-Tab Sync Tests', () => {
  let browser: Browser;
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  test.beforeEach(async ({ browser: b }) => {
    browser = b;

    // Create two browser contexts to simulate different tabs
    context1 = await browser.newContext();
    context2 = await browser.newContext();

    // Create pages in each context
    page1 = await context1.newPage();
    page2 = await context2.newPage();

    // Navigate both pages to the app
    await page1.goto('/');
    await page2.goto('/');

    // Wait for app to load
    await page1.waitForSelector('[data-testid="tab"]');
    await page2.waitForSelector('[data-testid="tab"]');
  });

  test.afterEach(async () => {
    await context1.close();
    await context2.close();
  });

  test('should sync new conversation across tabs', async () => {
    // Create AI chat in first tab
    await page1.keyboard.press('Control+Alt+C');
    await expect(page1.getByTestId('ai-chat-container')).toBeVisible();

    // Send a message in first tab
    const input1 = page1.getByTestId('ai-chat-input');
    await input1.fill('Hello from tab 1');
    await page1.keyboard.press('Enter');

    // Wait for message to appear
    await expect(page1.locator('text="Hello from tab 1"')).toBeVisible({ timeout: 10000 });

    // Open chat explorer in second tab
    await page2.keyboard.press('Control+Shift+E');
    await page2.waitForTimeout(1000); // Give time for sync

    // Check if the conversation appears in the second tab's chat explorer
    await expect(page2.locator('[data-testid^="chat-explorer-node"]')).toBeVisible({
      timeout: 10000,
    });

    // Click on the conversation in the second tab
    const chatNode = page2.locator('[data-testid^="chat-explorer-node"]').first();
    await chatNode.click();

    // Verify the message appears in the second tab
    await expect(page2.locator('text="Hello from tab 1"')).toBeVisible({ timeout: 10000 });
  });

  test('should sync message updates across tabs', async () => {
    // Create AI chat in first tab
    await page1.keyboard.press('Control+Alt+C');
    await expect(page1.getByTestId('ai-chat-container')).toBeVisible();

    // Send a message
    const input1 = page1.getByTestId('ai-chat-input');
    await input1.fill('Original message');
    await page1.keyboard.press('Enter');

    // Wait for message to appear
    await expect(page1.locator('text="Original message"')).toBeVisible({ timeout: 10000 });

    // Open the same conversation in second tab
    await page2.keyboard.press('Control+Shift+E');
    await page2.waitForTimeout(1000);
    const chatNode = page2.locator('[data-testid^="chat-explorer-node"]').first();
    await chatNode.click();

    // Verify message is visible in second tab
    await expect(page2.locator('text="Original message"')).toBeVisible({ timeout: 10000 });

    // Send another message from tab 2
    const input2 = page2.getByTestId('ai-chat-input');
    await input2.fill('Message from tab 2');
    await page2.keyboard.press('Enter');

    // Wait for new message in tab 2
    await expect(page2.locator('text="Message from tab 2"')).toBeVisible({ timeout: 10000 });

    // Check if the new message appears in tab 1
    await page1.waitForTimeout(1000); // Give time for sync
    await expect(page1.locator('text="Message from tab 2"')).toBeVisible({ timeout: 10000 });
  });

  test('should sync conversation deletion across tabs', async () => {
    // Create AI chat in first tab
    await page1.keyboard.press('Control+Alt+C');
    await expect(page1.getByTestId('ai-chat-container')).toBeVisible();

    // Send a message to create conversation
    const input1 = page1.getByTestId('ai-chat-input');
    await input1.fill('Test conversation for deletion');
    await page1.keyboard.press('Enter');
    await expect(page1.locator('text="Test conversation for deletion"')).toBeVisible();

    // Open chat explorer in both tabs
    await page1.keyboard.press('Control+Shift+E');
    await page2.keyboard.press('Control+Shift+E');
    await page2.waitForTimeout(1000);

    // Verify conversation exists in both tabs
    await expect(page1.locator('[data-testid^="chat-explorer-node"]')).toBeVisible();
    await expect(page2.locator('[data-testid^="chat-explorer-node"]')).toBeVisible();

    // Delete conversation from first tab
    const deleteButton1 = page1.locator('[data-testid="delete-node-button"]').first();
    await deleteButton1.hover();
    await deleteButton1.click();

    // Confirm deletion
    const confirmButton = page1.getByRole('button', { name: 'Delete' });
    await confirmButton.click();

    // Wait for deletion to complete
    await page1.waitForTimeout(1000);

    // Verify conversation is deleted in both tabs
    await expect(page1.locator('[data-testid^="chat-explorer-node"]')).toBeHidden();
    await expect(page2.locator('[data-testid^="chat-explorer-node"]')).toBeHidden();
  });

  test('should sync conversation title updates across tabs', async () => {
    // Create AI chat in first tab
    await page1.keyboard.press('Control+Alt+C');
    await expect(page1.getByTestId('ai-chat-container')).toBeVisible();

    // Send a message
    const input1 = page1.getByTestId('ai-chat-input');
    await input1.fill('Initial message');
    await page1.keyboard.press('Enter');
    await expect(page1.locator('text="Initial message"')).toBeVisible();

    // Open chat explorer in both tabs
    await page1.keyboard.press('Control+Shift+E');
    await page2.keyboard.press('Control+Shift+E');
    await page2.waitForTimeout(1000);

    // Rename conversation in first tab
    const chatNode1 = page1.locator('[data-testid^="chat-explorer-node"]').first();
    await chatNode1.click({ button: 'right' });

    // Click rename option
    const renameOption = page1.getByText('Rename');
    await renameOption.click();

    // Enter new name
    const renameInput = page1.locator('input[type="text"]');
    await renameInput.fill('Updated Chat Title');
    await page1.keyboard.press('Enter');

    // Wait for sync
    await page2.waitForTimeout(2000);

    // Verify title is updated in second tab
    await expect(page2.locator('text="Updated Chat Title"')).toBeVisible({ timeout: 10000 });
  });

  test('should handle concurrent edits from multiple tabs', async () => {
    // Create AI chat in first tab
    await page1.keyboard.press('Control+Alt+C');
    await expect(page1.getByTestId('ai-chat-container')).toBeVisible();

    // Send initial message
    const input1 = page1.getByTestId('ai-chat-input');
    await input1.fill('Starting conversation');
    await page1.keyboard.press('Enter');
    await expect(page1.locator('text="Starting conversation"')).toBeVisible();

    // Open same conversation in second tab
    await page2.keyboard.press('Control+Shift+E');
    await page2.waitForTimeout(1000);
    const chatNode = page2.locator('[data-testid^="chat-explorer-node"]').first();
    await chatNode.click();

    // Send messages from both tabs simultaneously
    const input2 = page2.getByTestId('ai-chat-input');

    // Type in both inputs without sending
    await input1.fill('Message from tab 1');
    await input2.fill('Message from tab 2');

    // Send both messages with minimal delay
    await Promise.all([page1.keyboard.press('Enter'), page2.keyboard.press('Enter')]);

    // Wait for messages to appear
    await page1.waitForTimeout(3000);

    // Both messages should appear in both tabs
    await expect(page1.locator('text="Message from tab 1"')).toBeVisible({ timeout: 10000 });
    await expect(page1.locator('text="Message from tab 2"')).toBeVisible({ timeout: 10000 });
    await expect(page2.locator('text="Message from tab 1"')).toBeVisible({ timeout: 10000 });
    await expect(page2.locator('text="Message from tab 2"')).toBeVisible({ timeout: 10000 });
  });
});
