import { mergeTests, expect } from '@playwright/test';

import { test as aiChatTest } from '../fixtures/ai-chat';
import { test as pageTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(pageTest, aiChatTest, tabTest);

test.describe.skip('AI Chat DDL Query Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock AI service to return DDL queries
    await page.route('**/v1/messages', async (route) => {
      const request = route.request();
      const body = request.postDataJSON();
      const userMessage = body.messages?.find((m: any) => m.role === 'user')?.content || '';

      let responseContent = '';

      if (userMessage.toLowerCase().includes('create table')) {
        responseContent =
          "I'll create a table for you.\n\n[EXPLANATION]\nCreating a new table called users with id, name, and email columns\n\n[SQL]\nCREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR, email VARCHAR)";
      } else if (userMessage.toLowerCase().includes('alter table')) {
        responseContent =
          "I'll add a new column to the users table.\n\n[EXPLANATION]\nAdding a created_at column to track when records were created\n\n[SQL]\nALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP";
      } else if (userMessage.toLowerCase().includes('drop table')) {
        responseContent =
          "I'll drop the old_users table.\n\n[EXPLANATION]\nRemoving the old_users table as it's no longer needed\n\n[SQL]\nDROP TABLE IF EXISTS old_users";
      } else if (userMessage.toLowerCase().includes('create view')) {
        responseContent =
          "I'll create a view to show active users.\n\n[EXPLANATION]\nCreating a view to filter only active users\n\n[SQL]\nCREATE VIEW active_users AS SELECT * FROM users WHERE status = 'active'";
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: responseContent,
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });
    });
  });

  test('should show warning for CREATE TABLE DDL query', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send DDL query message
    await aiChat.sendMessage('Create a table for users');

    // Wait for response
    await page.waitForSelector('[data-testid="ai-chat-message"]', { state: 'visible' });
    await page.waitForTimeout(1000); // Give time for query detection

    // Check for DDL warning message
    await expect(page.locator('text=/DDL statements.*not executed automatically/i')).toBeVisible({
      timeout: 10000,
    });

    // Verify SQL display shows the CREATE TABLE statement
    await expect(page.locator('text=/CREATE TABLE users/i')).toBeVisible();

    // Verify the run button exists for manual execution
    await expect(page.getByTestId('ai-chat-rerun-query')).toBeVisible();
  });

  test('should show confirmation dialog when running DDL query', async ({ page, aiChat }) => {
    // Open AI chat and send DDL query
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    await aiChat.sendMessage('Create a table for users');
    await page.waitForSelector('text=/DDL statements.*not executed automatically/i');

    // Click the run button
    await page.getByTestId('ai-chat-rerun-query').click();

    // Verify confirmation dialog appears
    await expect(page.locator('text=/Execute DDL Statement/i')).toBeVisible();
    await expect(page.locator('text=/modify the database structure/i')).toBeVisible();

    // Check for Execute and Cancel buttons
    await expect(page.getByRole('button', { name: 'Execute' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should handle ALTER TABLE DDL query', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send ALTER TABLE message
    await aiChat.sendMessage('Alter table to add created_at column');

    // Wait for response with DDL warning
    await expect(page.locator('text=/DDL statements.*not executed automatically/i')).toBeVisible({
      timeout: 10000,
    });

    // Verify the ALTER TABLE statement is shown
    await expect(page.locator('text=/ALTER TABLE users ADD COLUMN/i')).toBeVisible();
  });

  test('should handle DROP TABLE DDL query', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send DROP TABLE message
    await aiChat.sendMessage('Drop table old_users');

    // Wait for response with DDL warning
    await expect(page.locator('text=/DDL statements.*not executed automatically/i')).toBeVisible({
      timeout: 10000,
    });

    // Verify the DROP TABLE statement is shown
    await expect(page.locator('text=/DROP TABLE IF EXISTS old_users/i')).toBeVisible();
  });

  test('should handle CREATE VIEW DDL query', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send CREATE VIEW message
    await aiChat.sendMessage('Create a view for active users');

    // Wait for response with DDL warning
    await expect(page.locator('text=/DDL statements.*not executed automatically/i')).toBeVisible({
      timeout: 10000,
    });

    // Verify the CREATE VIEW statement is shown
    await expect(page.locator('text=/CREATE VIEW active_users/i')).toBeVisible();
  });

  test('should allow editing DDL query before execution', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send DDL query
    await aiChat.sendMessage('Create table for users');
    await page.waitForSelector('text=/DDL statements.*not executed automatically/i');

    // Click edit button
    await page.getByTestId('ai-chat-edit-query').click();

    // Verify editor is visible
    const editor = page.locator('.cm-editor');
    await expect(editor).toBeVisible();

    // Verify save and cancel buttons appear
    await expect(page.getByTestId('ai-chat-save-edit')).toBeVisible();
    await expect(page.getByTestId('ai-chat-cancel-edit')).toBeVisible();
  });
});
