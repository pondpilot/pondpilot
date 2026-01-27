import { Alert, Text, Button, Group } from '@mantine/core';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { IconSparkles, IconSettings } from '@tabler/icons-react';
import { useState, useEffect, useCallback } from 'react';

import { isPollyProvider } from '../../models/ai-service';
import { getAIConfig } from '../../utils/ai-config';
import { navigateToSettings } from '../../utils/route-navigation';

interface PollyDemoBannerProps {
  /** Additional class name for styling */
  className?: string;
  /** Variant for different display contexts */
  variant?: 'default' | 'compact';
  /** Current AI provider ID (for reactive visibility updates) */
  providerId?: string;
}

/**
 * Dismissable banner that informs users they're using the demo Polly AI model.
 * Only shows on first use and can be dismissed permanently.
 */
export function PollyDemoBanner({
  className,
  variant = 'default',
  providerId,
}: PollyDemoBannerProps) {
  const [visible, setVisible] = useState(false);

  const currentProvider = providerId ?? getAIConfig().provider;

  useEffect(() => {
    // Check if Polly is the current provider
    if (!isPollyProvider(currentProvider)) {
      setVisible(false);
      return;
    }

    // Check if user has dismissed the banner before
    const wasDismissed = localStorage.getItem(LOCAL_STORAGE_KEYS.POLLY_DEMO_BANNER_DISMISSED);
    setVisible(!wasDismissed);
  }, [currentProvider]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(LOCAL_STORAGE_KEYS.POLLY_DEMO_BANNER_DISMISSED, 'true');
  }, []);

  const handleConfigureByok = useCallback(() => {
    handleDismiss();
    navigateToSettings();
  }, [handleDismiss]);

  if (!visible) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <Alert
        icon={<IconSparkles size={14} />}
        color="blue"
        variant="light"
        withCloseButton
        closeButtonLabel="Dismiss"
        onClose={handleDismiss}
        className={className}
        p="xs"
      >
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="xs">
            Using Polly AI (demo).{' '}
            <Text component="span" c="dimmed" size="xs">
              Limited usage.
            </Text>
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconSettings size={12} />}
            onClick={handleConfigureByok}
          >
            Add API Key
          </Button>
        </Group>
      </Alert>
    );
  }

  return (
    <Alert
      icon={<IconSparkles size={16} />}
      title="Welcome to Polly AI"
      color="blue"
      variant="light"
      withCloseButton
      closeButtonLabel="Dismiss"
      onClose={handleDismiss}
      className={className}
    >
      <Text size="sm" mb="sm">
        You&apos;re using Polly, PondPilot&apos;s built-in AI assistant. It&apos;s ready to help
        with your SQL queries right away!
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        Polly has limited usage. For production use, we recommend adding your own API key from
        OpenAI or Anthropic for unlimited access.
      </Text>
      <Group gap="sm">
        <Button
          size="xs"
          variant="filled"
          leftSection={<IconSettings size={14} />}
          onClick={handleConfigureByok}
        >
          Configure API Key
        </Button>
        <Button size="xs" variant="default" onClick={handleDismiss}>
          Continue with Polly
        </Button>
      </Group>
    </Alert>
  );
}

/**
 * Reset the Polly demo banner dismissed state.
 * Exported for use in integration tests to reset state between test runs.
 */
export function resetPollyDemoBannerDismissed(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.POLLY_DEMO_BANNER_DISMISSED);
}
