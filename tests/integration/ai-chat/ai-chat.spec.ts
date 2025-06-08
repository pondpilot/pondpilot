import { mergeTests, expect } from '@playwright/test';

import { createFile } from '../../utils';
import { test as aiChatTest } from '../fixtures/ai-chat';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as notificationsTest } from '../fixtures/notifications';
import { test as pageTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as startGuideTest } from '../fixtures/start-guide';
import { test as storageTest } from '../fixtures/storage';
import { test as tabTest } from '../fixtures/tab';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  pageTest,
  aiChatTest,
  tabTest,
  dataViewTest,
  scriptEditorTest,
  notificationsTest,
  storageTest,
  testTmpTest,
  filePickerTest,
  startGuideTest,
);

test.describe('AI Chat Feature', () => {
  test.beforeEach(async ({ storage, testTmp, filePicker, addFileButton }) => {
    // Create test data file
    const testDataPath = testTmp.join('test_data.csv');
    createFile(testDataPath, `id,name,value
1,Alice,100
2,Bob,200
3,Charlie,300`);

    // Upload test data file
    await storage.uploadFile(testDataPath, 'test_data.csv');

    // Add the file to the app
    await filePicker.selectFiles(['test_data.csv']);
    await addFileButton.click();
  });

  test('should open AI chat tab via spotlight', async ({ aiChat, page }) => {
    // Open spotlight
    await page.keyboard.press('Control+K');
    await page.waitForSelector('[data-testid="spotlight-search"]', { timeout: 5000 });

    // Search for chat
    await page.fill('[data-testid="spotlight-search"]', 'chat');

    // Wait for the option to appear
    await page.waitForSelector('text=Chat with Data', { timeout: 5000 });

    // Click on "Chat with Data" option
    await page.click('text=Chat with Data');

    // Wait for spotlight to close
    await page.waitForSelector('[data-testid="spotlight-search"]', { state: 'hidden', timeout: 5000 });

    // Verify chat tab is created
    await aiChat.assertChatTabExists();

    // Verify tab is created
    const chatTab = page.getByTestId('tab').filter({ hasText: 'Chat with Data' });
    await expect(chatTab).toBeVisible({ timeout: 10000 });
  });

  test('should send message and receive response', async ({ aiChat }) => {
    await aiChat.openAIChatTab();

    // Send a simple question
    await aiChat.sendMessage('How many rows are in test_data.csv?');
    await aiChat.waitForResponse();

    // Should have at least 2 messages (user + assistant)
    const messageCount = await aiChat.getMessageCount();
    expect(messageCount).toBeGreaterThanOrEqual(2);

    // Check that response mentions the table
    await aiChat.assertMessageContains('test_data');
  });

  test('should execute query and display results', async ({ aiChat }) => {
    await aiChat.openAIChatTab();

    // Ask for data
    await aiChat.sendMessage('Show me all data from test_data.csv');
    await aiChat.waitForResponse();

    // Wait for query result
    await aiChat.page.waitForSelector('[data-testid="ai-chat-query-result"]');

    // Verify query results
    const result = await aiChat.getQueryResult();
    expect(result).not.toBeNull();
    expect(result!.columns).toEqual(['id', 'name', 'value']);
    expect(result!.rows).toHaveLength(3);
  });

  test('should handle query errors gracefully', async ({ aiChat }) => {
    await aiChat.openAIChatTab();

    // Ask for non-existent table
    await aiChat.sendMessage('SELECT * FROM non_existent_table');
    await aiChat.waitForResponse();

    // Should show error in the UI
    const lastMessage = await aiChat.getLastMessage();
    expect(lastMessage).toContain('error');
  });

  test('should copy query to clipboard', async ({ aiChat, expectNotificationWithText, page }) => {
    await aiChat.openAIChatTab();

    // Generate a query
    await aiChat.sendMessage('Count rows in test_data.csv');
    await aiChat.waitForResponse();

    // Wait for query to appear
    await page.waitForSelector('[data-testid="ai-chat-copy-query"]');

    // Copy query
    await aiChat.clickCopyQuery();

    // Verify notification
    await expectNotificationWithText('', 'Query copied to clipboard');
  });

  test('should open query in new script tab', async ({ aiChat, page, switchToTab }) => {
    await aiChat.openAIChatTab();

    // Generate a query
    await aiChat.sendMessage('Select all names from test_data.csv');
    await aiChat.waitForResponse();

    // Wait for query to appear
    await page.waitForSelector('[data-testid="ai-chat-open-script"]');

    // Open in script
    await aiChat.clickOpenInScript();

    // Verify new script tab is created
    const scriptTab = await page.getByTestId('tab').filter({ hasText: 'query' });
    await expect(scriptTab).toBeVisible();

    // Switch to the new script tab
    await switchToTab('query');

    // Verify script contains the query
    const scriptContent = page.locator('[data-active-editor="true"] .cm-content');
    await expect(scriptContent).toContainText('SELECT');
  });

  test('should maintain conversation context', async ({ aiChat }) => {
    await aiChat.openAIChatTab();

    // First question
    await aiChat.sendMessage('What tables do I have?');
    await aiChat.waitForResponse();

    // Follow-up question referencing previous context
    await aiChat.sendMessage('How many rows in the first one?');
    await aiChat.waitForResponse();

    // Should have 4 messages total
    const messageCount = await aiChat.getMessageCount();
    expect(messageCount).toBe(4);

    // Response should reference test_data
    await aiChat.assertMessageContains('test_data');
  });

  test('should handle multiple queries in conversation', async ({ aiChat }) => {
    await aiChat.openAIChatTab();

    // First query
    await aiChat.sendMessage('Show me the first row of test_data.csv');
    await aiChat.waitForResponse();

    const result = await aiChat.getQueryResult();
    expect(result).not.toBeNull();
    expect(result!.rows).toHaveLength(1);

    // Second query
    await aiChat.sendMessage('Now show me rows where value > 150');
    await aiChat.waitForResponse();

    // Wait for new result
    await new Promise(resolve => setTimeout(resolve, 1000)); // Allow UI to update

    // Get all query results (should be 2)
    const allResults = await aiChat.page.$$('[data-testid="ai-chat-query-result"]');
    expect(allResults).toHaveLength(2);
  });

  test('should persist conversation across page reload', async ({ aiChat, page, switchToTab }) => {
    await aiChat.openAIChatTab();

    // Send a message
    await aiChat.sendMessage('List all columns in test_data.csv');
    await aiChat.waitForResponse();

    // Get message count before reload
    const messageCountBefore = await aiChat.getMessageCount();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Switch back to chat tab
    await switchToTab('Chat with Data');

    // Verify messages are still there
    const messageCountAfter = await aiChat.getMessageCount();
    expect(messageCountAfter).toBe(messageCountBefore);
  });

  test('should handle empty/null results', async ({ aiChat }) => {
    await aiChat.openAIChatTab();

    // Query that returns no results
    await aiChat.sendMessage('SELECT * FROM test_data WHERE id > 1000');
    await aiChat.waitForResponse();

    // Should show empty result message
    await aiChat.assertMessageContains('0 rows');
  });

  test('should format different data types correctly', async ({ aiChat, storage, page, testTmp, filePicker, addFileButton }) => {
    // Upload data with various types
    const mixedTypesPath = testTmp.join('mixed_types.csv');
    createFile(mixedTypesPath, `date,number,boolean,text
2024-01-01,123.45,true,Hello
2024-02-01,456.78,false,World`);
    await storage.uploadFile(mixedTypesPath, 'mixed_types.csv');

    await filePicker.selectFiles(['mixed_types.csv']);
    await addFileButton.click();

    await aiChat.openAIChatTab();
    await aiChat.sendMessage('Show all data from mixed_types.csv');
    await aiChat.waitForResponse();

    const result = await aiChat.getQueryResult();
    expect(result).not.toBeNull();
    expect(result!.columns).toEqual(['date', 'number', 'boolean', 'text']);

    // Verify data is displayed
    expect(result!.rows[0]).toContain('2024-01-01');
    expect(result!.rows[0]).toContain('123.45');
  });

  test('should show truncation message for large results', async ({ aiChat, storage, page, testTmp, filePicker, addFileButton }) => {
    // Create CSV with 150 rows
    const rows = ['id,value'];
    for (let i = 1; i <= 150; i++) {
      rows.push(`${i},${i * 10}`);
    }
    const largeDataPath = testTmp.join('large_data.csv');
    createFile(largeDataPath, rows.join('\n'));
    await storage.uploadFile(largeDataPath, 'large_data.csv');

    await filePicker.selectFiles(['large_data.csv']);
    await addFileButton.click();

    await aiChat.openAIChatTab();
    await aiChat.sendMessage('SELECT * FROM large_data');
    await aiChat.waitForResponse();

    // Should mention truncation (limited to 100 rows)
    await aiChat.assertMessageContains('truncated');
    await aiChat.assertMessageContains('100');
  });

  test('should handle schema context correctly', async ({ aiChat, storage, page, testTmp, filePicker, addFileButton }) => {
    // Upload multiple files to have richer schema
    const productsPath = testTmp.join('products.csv');
    createFile(productsPath, 'id,product\n1,Apple\n2,Banana');
    await storage.uploadFile(productsPath, 'products.csv');

    const inventoryPath = testTmp.join('inventory.csv');
    createFile(inventoryPath, 'product_id,quantity\n1,50\n2,30');
    await storage.uploadFile(inventoryPath, 'inventory.csv');

    await filePicker.selectFiles(['products.csv']);
    await addFileButton.click();
    await filePicker.selectFiles(['inventory.csv']);
    await addFileButton.click();

    await aiChat.openAIChatTab();

    // Ask about schema
    await aiChat.sendMessage('What tables and columns are available?');
    await aiChat.waitForResponse();

    // Should mention all tables
    await aiChat.assertMessageContains('test_data');
    await aiChat.assertMessageContains('products');
    await aiChat.assertMessageContains('inventory');
  });

  test('should handle keyboard shortcut to open chat', async ({ page, aiChat }) => {
    // Use keyboard shortcut
    await page.keyboard.press('Control+Alt+C');

    // Verify chat tab opens
    await aiChat.assertChatTabExists();
    const chatTab = await page.getByTestId('tab').filter({ hasText: 'Chat with Data' });
    await expect(chatTab).toBeVisible();
  });
});
