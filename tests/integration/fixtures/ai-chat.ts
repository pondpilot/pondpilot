import { Page, test as base } from '@playwright/test';

class AIChatFixture {
  constructor(public readonly page: Page) {}

  async openAIChatTab() {
    // Open spotlight
    await this.page.keyboard.press('Control+K');
    await this.page.waitForSelector('[data-testid="spotlight-search"]');

    // Search for chat
    await this.page.fill('[data-testid="spotlight-search"]', 'chat');

    // Click on "Chat with Data" option
    await this.page.click('text=Chat with Data');
  }

  async sendMessage(message: string) {
    const input = this.page.getByTestId('ai-chat-input');
    await input.fill(message);
    await this.page.keyboard.press('Enter');
  }

  async waitForResponse() {
    // Wait for loading to finish
    await this.page.waitForSelector('[data-testid="ai-chat-loading"]', { state: 'hidden' });
  }

  async getMessageCount(): Promise<number> {
    const messages = await this.page.$$('[data-testid="ai-chat-message"]');
    return messages.length;
  }

  async getLastMessage(): Promise<string | null> {
    const messages = await this.page.$$('[data-testid="ai-chat-message"]');
    if (messages.length === 0) return null;

    const lastMessage = messages[messages.length - 1];
    const content = await lastMessage.textContent();
    return content;
  }

  async getQueryResult(): Promise<{ columns: string[]; rows: string[][] } | null> {
    const table = await this.page.$('[data-testid="ai-chat-query-result"]');
    if (!table) return null;

    // Get columns
    const headerCells = await table.$$('thead th');
    const columns = await Promise.all(
      headerCells.map(async (cell) => (await cell.textContent()) || ''),
    );

    // Get rows
    const bodyRows = await table.$$('tbody tr');
    const rows = await Promise.all(
      bodyRows.map(async (row) => {
        const cells = await row.$$('td');
        return Promise.all(cells.map(async (cell) => (await cell.textContent()) || ''));
      }),
    );

    return { columns, rows };
  }

  async clickCopyQuery() {
    await this.page.click('[data-testid="ai-chat-copy-query"]');
  }

  async clickOpenInScript() {
    await this.page.click('[data-testid="ai-chat-open-script"]');
  }

  async assertChatTabExists() {
    await this.page.waitForSelector('[data-testid="ai-chat-container"]');
  }

  async assertMessageContains(text: string) {
    await this.page.waitForSelector(`[data-testid="ai-chat-message"]:has-text("${text}")`);
  }

  async getErrorMessage(): Promise<string | null> {
    const error = await this.page.$('[data-testid="ai-chat-error"]');
    if (!error) return null;
    return await error.textContent();
  }
}

export const test = base.extend<{
  aiChat: AIChatFixture;
  mockAIService: void;
}>({
  aiChat: async ({ page }, use) => {
    await use(new AIChatFixture(page));
  },

  mockAIService: [
    async ({ page }, use) => {
      // Mock AI service responses - handle both OpenAI and Anthropic endpoints
      await page.route('**/v1/messages', async (route) => {
        const request = route.request();
        const body = request.postDataJSON();

        // Extract the user message
        const userMessage = body.messages?.find((m: any) => m.role === 'user')?.content || '';

        // Generate appropriate mock response based on the message
        let responseContent = '';

        if (userMessage.toLowerCase().includes('how many rows')) {
          responseContent =
            'Let me check how many rows are in test_data.csv.\n\n[EXPLANATION]\nCounting all rows in the test_data table\n\n[SQL]\nSELECT COUNT(*) as row_count FROM test_data';
        } else if (
          userMessage.toLowerCase().includes('show me all data') ||
          userMessage.toLowerCase().includes('show all data')
        ) {
          responseContent =
            "I'll retrieve all data from test_data.csv for you.\n\n[EXPLANATION]\nSelecting all columns and rows from the test_data table\n\n[SQL]\nSELECT * FROM test_data";
        } else if (userMessage.toLowerCase().includes('non_existent_table')) {
          responseContent =
            "I'll query the non_existent_table.\n\n[EXPLANATION]\nAttempting to select from the requested table\n\n[SQL]\nSELECT * FROM non_existent_table";
        } else if (userMessage.toLowerCase().includes('count rows')) {
          responseContent =
            "I'll count the rows in test_data.csv.\n\n[EXPLANATION]\nCounting total rows in the table\n\n[SQL]\nSELECT COUNT(*) FROM test_data";
        } else if (userMessage.toLowerCase().includes('select all names')) {
          responseContent =
            "I'll select all names from test_data.csv.\n\n[EXPLANATION]\nSelecting the name column from test_data\n\n[SQL]\nSELECT name FROM test_data";
        } else if (userMessage.toLowerCase().includes('what tables')) {
          responseContent =
            'Based on the schema, you have the following tables available:\n\n- test_data (with columns: id, name, value)';
        } else if (userMessage.toLowerCase().includes('how many rows in the first')) {
          responseContent =
            'Based on our previous discussion, test_data has rows. Let me count them.\n\n[EXPLANATION]\nCounting rows in test_data\n\n[SQL]\nSELECT COUNT(*) FROM test_data';
        } else if (userMessage.toLowerCase().includes('first row')) {
          responseContent =
            "I'll show you the first row of test_data.csv.\n\n[EXPLANATION]\nSelecting the first row from test_data\n\n[SQL]\nSELECT * FROM test_data LIMIT 1";
        } else if (userMessage.toLowerCase().includes('value > 150')) {
          responseContent =
            "I'll find rows where value is greater than 150.\n\n[EXPLANATION]\nFiltering rows where the value column exceeds 150\n\n[SQL]\nSELECT * FROM test_data WHERE value > 150";
        } else if (userMessage.toLowerCase().includes('list all columns')) {
          responseContent =
            "I'll list all columns in test_data.csv.\n\n[EXPLANATION]\nGetting column information from test_data\n\n[SQL]\nSELECT column_name FROM information_schema.columns WHERE table_name = 'test_data'";
        } else if (userMessage.toLowerCase().includes('id > 1000')) {
          responseContent =
            "I'll find rows where id is greater than 1000.\n\n[EXPLANATION]\nFiltering rows with id > 1000\n\n[SQL]\nSELECT * FROM test_data WHERE id > 1000";
        } else if (userMessage.toLowerCase().includes('mixed_types')) {
          responseContent =
            "I'll show all data from mixed_types.csv.\n\n[EXPLANATION]\nSelecting all data from mixed_types table\n\n[SQL]\nSELECT * FROM mixed_types";
        } else if (userMessage.toLowerCase().includes('large_data')) {
          responseContent =
            "I'll retrieve all data from large_data.\n\n[EXPLANATION]\nSelecting all rows from large_data\n\n[SQL]\nSELECT * FROM large_data";
        } else if (userMessage.toLowerCase().includes('what tables and columns')) {
          responseContent =
            'Here are all available tables and their columns:\n\n**test_data**\n- id (integer)\n- name (varchar)\n- value (integer)\n\n**products**\n- id (integer)\n- product (varchar)\n\n**inventory**\n- product_id (integer)\n- quantity (integer)';
        } else if (userMessage.toLowerCase().includes('test malicious script injection')) {
          responseContent =
            'This content has been sanitized. <script>alert("XSS attempt")</script> The script above should not execute. Also testing <img src="x" onclick="alert(\'XSS\')"> and [malicious link](javascript:alert("XSS")).';
        } else if (userMessage.toLowerCase().includes('test safe markdown')) {
          responseContent =
            'Here is **bold text**, *italic text*, and `code text`. This should be preserved:\n\n```sql\nSELECT * FROM test_data;\n```\n\nAnd a safe [link](https://example.com).';
        } else {
          responseContent = 'I can help you query your data. What would you like to know?';
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
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          }),
        });
      });

      await use();
    },
    { auto: true },
  ],
});
