import type { BugReportPayload, BugReportCategory } from '@models/bug-report';
import { BUG_REPORT_CATEGORY_META } from '@models/bug-report';
import { formatContextForSlack } from '@utils/bug-report-context';

// Derive emoji and label from centralized metadata

/**
 * Formats the bug report as Slack blocks for rich formatting
 */
function formatSlackMessage(payload: BugReportPayload) {
  const { formData, context } = payload;
  const meta = BUG_REPORT_CATEGORY_META[formData.category as BugReportCategory];
  const emoji = meta?.emoji || '🐛';
  const categoryLabel = meta?.label || formData.category;

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${categoryLabel}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Reporter:*\n${formData.email || 'Anonymous'}`,
        },
      ],
    },
    {
      type: 'divider',
    },
  ];

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Description:*\n${formData.description}`,
    },
  });

  if (context && formData.includeContext) {
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Technical Context:*\n\`\`\`\n${formatContextForSlack(context)}\n\`\`\``,
        },
      },
    );
  }

  return { blocks };
}

/**
 * Uploads a screenshot file to Slack
 * Note: This requires Slack API token and file upload endpoint, which is more complex
 * For webhook-only integration, we'll include the screenshot as a data URL in context
 */
async function _uploadScreenshotToSlack(
  _screenshot: string,
  _webhookUrl: string,
): Promise<string | null> {
  // Placeholder for future enhancement (Slack file upload API integration)
  return null;
}

/**
 * Sends a bug report to Slack via CORS proxy
 * @param payload The bug report payload
 * @returns Promise resolving to success status
 */
export async function sendBugReportToSlack(
  payload: BugReportPayload,
): Promise<{ success: boolean; error?: string }> {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return {
      success: false,
      error: 'Bug report proxy not configured. Set VITE_BUG_REPORT_PROXY_URL in .env.local',
    };
  }

  try {
    const slackMessage = formatSlackMessage(payload);

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slackPayload: slackMessage,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Proxy error: ${response.status}`);
    }

    const result = await response.json();
    return { success: result.success || false };
  } catch (error) {
    console.error('Failed to send bug report to Slack:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets the proxy URL from environment variables
 */
function getProxyUrl(): string | null {
  return import.meta.env.VITE_BUG_REPORT_PROXY_URL || null;
}

/**
 * Checks if bug report integration is configured
 */
export function isSlackIntegrationConfigured(): boolean {
  return !!getProxyUrl();
}
