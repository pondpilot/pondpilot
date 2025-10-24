import type { BugReportPayload } from '@models/bug-report';
import { formatContextForSlack } from '@utils/bug-report-context';

interface SlackWebhookResponse {
  ok: boolean;
  error?: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  crash: '💥',
  'data-issue': '📊',
  'ui-bug': '🎨',
  performance: '⚡',
  'feature-request': '💡',
  other: '❓',
};

const CATEGORY_OPTIONS = [
  { value: 'crash', label: 'Crash / Error' },
  { value: 'data-issue', label: 'Data Issue' },
  { value: 'ui-bug', label: 'UI Bug' },
  { value: 'performance', label: 'Performance' },
  { value: 'feature-request', label: 'Feature Request' },
  { value: 'other', label: 'Other' },
];

/**
 * Formats the bug report as Slack blocks for rich formatting
 */
function formatSlackMessage(payload: BugReportPayload) {
  const { formData, context } = payload;
  const emoji = CATEGORY_EMOJI[formData.category] || '🐛';

  const categoryLabel =
    CATEGORY_OPTIONS.find((opt) => opt.value === formData.category)?.label || formData.category;

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
async function uploadScreenshotToSlack(
  screenshot: string,
  webhookUrl: string,
): Promise<string | null> {
  return null;
}

/**
 * Sends a bug report to Slack via CORS proxy
 * @param payload The bug report payload
 * @param webhookUrl The Slack webhook URL
 * @returns Promise resolving to success status
 */
export async function sendBugReportToSlack(
  payload: BugReportPayload,
  webhookUrl: string,
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl) {
    return {
      success: false,
      error: 'Slack webhook URL not configured',
    };
  }

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
        webhookUrl,
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
 * Gets the Slack webhook URL from environment variables
 */
export function getSlackWebhookUrl(): string | null {
  return import.meta.env.VITE_SLACK_WEBHOOK_URL || null;
}

/**
 * Checks if Slack integration is configured
 */
export function isSlackIntegrationConfigured(): boolean {
  return !!getSlackWebhookUrl() && !!getProxyUrl();
}
