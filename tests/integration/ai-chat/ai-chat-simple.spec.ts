import { mergeTests, expect } from '@playwright/test';

import { test as aiChatTest } from '../fixtures/ai-chat';
import { test as pageTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(pageTest, aiChatTest, tabTest);

test.describe.skip('AI Chat Simple Tests', () => {
  test('should create AI chat tab using keyboard shortcut', async ({ page }) => {
    // Use keyboard shortcut to open AI chat
    await page.keyboard.press('Control+Alt+C');

    // Wait for the chat tab to appear
    await page.waitForSelector('[data-testid="tab"]:has-text("Chat with Data")', {
      timeout: 10000,
    });

    // Verify the tab exists
    const chatTab = page.getByTestId('tab').filter({ hasText: 'Chat with Data' });
    await expect(chatTab).toBeVisible();

    // Verify the chat container exists
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();
  });

  test('should create AI chat tab via spotlight', async ({ page }) => {
    // Open spotlight
    await page.keyboard.press('Control+K');

    // Wait for spotlight to open
    await expect(page.getByTestId('spotlight-search')).toBeVisible({ timeout: 5000 });

    // Type "chat" to search
    await page.getByTestId('spotlight-search').fill('chat');

    // Wait for the option to appear and click it
    const chatOption = page.getByRole('button', { name: /Chat with Data/i });
    await expect(chatOption).toBeVisible({ timeout: 5000 });
    await chatOption.click();

    // Verify the tab was created
    const chatTab = page.getByTestId('tab').filter({ hasText: 'Chat with Data' });
    await expect(chatTab).toBeVisible({ timeout: 10000 });

    // Verify the chat container exists
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();
  });

  test('should send a message in AI chat', async ({ page }) => {
    // Create chat tab using shortcut
    await page.keyboard.press('Control+Alt+C');

    // Wait for chat to be ready
    await expect(page.getByTestId('ai-chat-container')).toBeVisible({ timeout: 10000 });

    // Send a message
    const input = page.getByTestId('ai-chat-input');
    await input.fill('Hello AI');
    await page.keyboard.press('Enter');

    // Wait for loading to appear and disappear
    await expect(page.getByTestId('ai-chat-loading')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('ai-chat-loading')).toBeHidden({ timeout: 30000 });

    // Verify we have at least 2 messages (user + assistant)
    const messages = page.locator('[data-testid="ai-chat-message"]');
    await expect(messages).toHaveCount(2, { timeout: 10000 });
  });
});
