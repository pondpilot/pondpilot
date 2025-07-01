import { mergeTests, expect } from '@playwright/test';

import { test as aiChatTest } from '../fixtures/ai-chat';
import { test as pageTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(pageTest, aiChatTest, tabTest);

test.describe.skip('AI Chat Chart Error Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock AI service to return various chart specifications
    await page.route('**/v1/messages', async (route) => {
      const request = route.request();
      const body = request.postDataJSON();
      const userMessage = body.messages?.find((m: any) => m.role === 'user')?.content || '';

      let responseContent = '';

      if (userMessage.toLowerCase().includes('invalid chart')) {
        // Return SQL with invalid chart spec
        responseContent = `I'll create a chart with invalid specification.

[EXPLANATION]
Getting sales data to visualize

[SQL]
SELECT month, revenue FROM sales

[CHART]
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "bar",
  "encoding": {
    "x": {"field": "nonexistent_field", "type": "ordinal"},
    "y": {"field": "another_missing_field", "type": "quantitative"}
  }
}`;
      } else if (userMessage.toLowerCase().includes('malformed json chart')) {
        // Return SQL with malformed JSON chart spec
        responseContent = `I'll create a chart but with malformed JSON.

[EXPLANATION]
Visualizing monthly data

[SQL]
SELECT month, value FROM monthly_data

[CHART]
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "line",
  "encoding": {
    "x": {"field": "month", "type": "temporal"},
    "y": {"field": "value", "type": "quantitative"
  } // Missing closing brace
}`;
      } else if (userMessage.toLowerCase().includes('missing encoding chart')) {
        // Return chart spec missing required encodings
        responseContent = `I'll create a chart missing required encodings.

[EXPLANATION]
Creating a visualization

[SQL]
SELECT category, count FROM data

[CHART]
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "bar"
}`;
      } else if (userMessage.toLowerCase().includes('valid chart')) {
        // Return a valid chart spec
        responseContent = `I'll create a proper chart visualization.

[EXPLANATION]
Visualizing sales by month

[SQL]
SELECT month, revenue FROM sales ORDER BY month

[CHART]
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "bar",
  "encoding": {
    "x": {"field": "month", "type": "ordinal"},
    "y": {"field": "revenue", "type": "quantitative"}
  }
}`;
      } else if (userMessage.toLowerCase().includes('chart with data')) {
        // Request chart generation from query results
        responseContent = `I'll show you the sales data and create a visualization.

[EXPLANATION]
Getting monthly sales data for visualization

[SQL]
SELECT month, revenue FROM sales ORDER BY month`;
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

    // Mock the chart generation endpoint
    await page.route('**/v1/chat/completions', async (route) => {
      const request = route.request();
      const body = request.postDataJSON();
      const prompt = body.messages?.[0]?.content || '';

      if (prompt.includes('Vega-Lite visualization')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'chatcmpl-mock-chart',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
                    mark: 'bar',
                    encoding: {
                      x: { field: 'month', type: 'ordinal' },
                      y: { field: 'revenue', type: 'quantitative' },
                    },
                  }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
        });
      }
    });
  });

  test('should show error for chart with non-existent fields', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send message requesting invalid chart
    await aiChat.sendMessage('Show me an invalid chart');

    // Wait for response
    await page.waitForSelector('[data-testid="ai-chat-message"]', { state: 'visible' });
    await page.waitForTimeout(2000); // Give time for chart rendering

    // Check for chart error message
    await expect(page.locator('text=/Column.*does not exist in the data/i')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show error for malformed JSON chart spec', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send message requesting malformed chart
    await aiChat.sendMessage('Show me a malformed JSON chart');

    // Wait for response
    await page.waitForSelector('[data-testid="ai-chat-message"]', { state: 'visible' });
    await page.waitForTimeout(2000);

    // No chart should be rendered due to parse error
    const chartElements = page.locator('.vega-embed');
    await expect(chartElements).toHaveCount(0);
  });

  test('should show error for missing encoding in chart', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send message requesting chart with missing encoding
    await aiChat.sendMessage('Show me a missing encoding chart');

    // Wait for response
    await page.waitForSelector('[data-testid="ai-chat-message"]', { state: 'visible' });
    await page.waitForTimeout(2000);

    // Check for error about missing encoding
    await expect(
      page.locator('text=/Chart specification is missing x or y encoding/i'),
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test('should render valid chart successfully', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send message requesting valid chart
    await aiChat.sendMessage('Show me a valid chart');

    // Wait for response
    await page.waitForSelector('[data-testid="ai-chat-message"]', { state: 'visible' });
    await page.waitForTimeout(2000);

    // Chart should be rendered successfully
    await expect(page.locator('.vega-embed')).toBeVisible({
      timeout: 10000,
    });

    // No error messages should appear
    await expect(page.locator('text=/Chart Rendering Error/i')).toBeHidden();
  });

  test('should show loading state while generating chart', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send message that will trigger chart generation
    await aiChat.sendMessage('show me sales chart with data');

    // Wait for initial response
    await page.waitForSelector('[data-testid="ai-chat-message"]', { state: 'visible' });

    // Check for "Generating chart..." message
    await expect(page.locator('text=/Generating chart.../i')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should provide helpful error messages for chart failures', async ({ page, aiChat }) => {
    // Open AI chat
    await page.keyboard.press('Control+Alt+C');
    await expect(page.getByTestId('ai-chat-container')).toBeVisible();

    // Send message requesting invalid chart
    await aiChat.sendMessage('Show me an invalid chart');

    // Wait for error to appear
    await page.waitForSelector('text=/Column.*does not exist/i', { timeout: 10000 });

    // Check for helpful suggestion text
    await expect(page.locator('text=/try asking for a different visualization/i')).toBeVisible();
  });
});
