import { Alert, Text, Anchor, Group, ActionIcon } from '@mantine/core';
import { IconInfoCircle, IconX } from '@tabler/icons-react';
import { useState, useEffect } from 'react';

const PRIVACY_DISMISSED_KEY = 'ai-chat-privacy-dismissed';

export const PrivacyNotification = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already dismissed the notification
    const isDismissed = localStorage.getItem(PRIVACY_DISMISSED_KEY) === 'true';
    setIsVisible(!isDismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(PRIVACY_DISMISSED_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Alert
      icon={<IconInfoCircle size={20} />}
      radius="md"
      className="mb-4 mx-4 max-w-3xl mx-auto"
      color="blue"
      withCloseButton={false}
    >
      <Group justify="space-between" align="flex-start">
        <div className="flex-1">
          <Text size="sm" fw={500} mb={4}>
            Privacy Notice
          </Text>
          <Text size="xs" c="dimmed">
            When you use AI features, your database schema (table and column names) is shared with
            your selected AI provider to generate accurate SQL queries. No actual data from your
            tables is sent unless you explicitly run a query. Your API keys are stored locally and
            never sent to our servers.{' '}
            <Anchor
              href="https://docs.pondpilot.io/privacy"
              target="_blank"
              size="xs"
              rel="noopener noreferrer"
            >
              Learn more
            </Anchor>
          </Text>
        </div>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          onClick={handleDismiss}
          aria-label="Dismiss privacy notification"
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
    </Alert>
  );
};
