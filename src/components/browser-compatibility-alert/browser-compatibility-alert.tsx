import { Alert, Text, Stack, List, Button, Group, Title, Collapse } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { IconAlertCircle, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { isTauriEnvironment } from '@utils/browser';
import { fileSystemService } from '@utils/file-system-adapter';
import { useState, useEffect } from 'react';

export function BrowserCompatibilityAlert() {
  const [dismissed, setDismissed] = useState(false);
  const [browserInfo, setBrowserInfo] = useState<ReturnType<
    typeof fileSystemService.getBrowserInfo
  > | null>(null);
  const [showDetails, { toggle: toggleDetails }] = useDisclosure(false);

  useEffect(() => {
    // Never show compatibility alert in Tauri
    if (isTauriEnvironment()) {
      return;
    }

    const info = fileSystemService.getBrowserInfo();

    // Only show for non-full compatibility
    if (info.level !== 'full') {
      setBrowserInfo(info);

      // Check if user has dismissed the alert before
      const wasDismissed = localStorage.getItem(LOCAL_STORAGE_KEYS.BROWSER_COMPATIBILITY_DISMISSED);
      if (wasDismissed) {
        setDismissed(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(LOCAL_STORAGE_KEYS.BROWSER_COMPATIBILITY_DISMISSED, 'true');
  };

  // Double-check: Never show in Tauri environment
  if (isTauriEnvironment() || !browserInfo || dismissed || browserInfo.level === 'full') {
    return null;
  }

  const { capabilities } = browserInfo;
  const isLimited = browserInfo.level === 'limited';

  // Generate specific feature messages based on capabilities
  const getFeatureMessages = () => {
    const messages = [];

    if (!capabilities.hasNativeFileSystemAccess) {
      messages.push({
        feature: 'File Access',
        status: 'limited',
        description: 'Files will be copied to browser memory instead of accessed directly',
      });
    }

    if (!capabilities.canPersistFileHandles) {
      messages.push({
        feature: 'Session Persistence',
        status: 'unavailable',
        description: "You'll need to re-select files when you return to PondPilot",
      });
    }

    if (!capabilities.canPickDirectories) {
      messages.push({
        feature: 'Folder Selection',
        status: 'unavailable',
        description: 'You can only select individual files, not entire folders',
      });
    }
    return messages;
  };

  const features = getFeatureMessages();

  return (
    <div className="p-4">
      <Alert
        icon={<IconAlertCircle size={16} />}
        title={
          <Group justify="space-between" style={{ width: '100%' }}>
            <Text fw={500}>{browserInfo.name} has limited PondPilot features</Text>
            <Button
              size="xs"
              variant="subtle"
              onClick={toggleDetails}
              rightSection={
                showDetails ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
              }
            >
              {showDetails ? 'Hide' : 'Show'} details
            </Button>
          </Group>
        }
        color={isLimited ? 'orange' : 'yellow'}
        withCloseButton
        closeButtonLabel="Dismiss"
        onClose={handleDismiss}
        className="mb-4"
      >
        <Stack gap="sm">
          <Text size="sm">
            For the best experience, we recommend using Google Chrome or Microsoft Edge.
          </Text>

          <Collapse in={showDetails}>
            <Stack gap="md" mt="sm">
              {features.length > 0 && (
                <div>
                  <Title order={6} mb="xs">
                    Feature Limitations:
                  </Title>
                  <Stack gap="xs">
                    {features.map((feature, index) => (
                      <Group key={index} gap="xs" align="flex-start">
                        <Text size="sm" fw={500} style={{ minWidth: 120 }}>
                          {feature.feature}:
                        </Text>
                        <Text size="sm" c={feature.status === 'unavailable' ? 'red' : 'yellow'}>
                          {feature.description}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </div>
              )}

              {browserInfo.recommendations.length > 0 && (
                <div>
                  <Title order={6} mb="xs">
                    What you can do:
                  </Title>
                  <List size="sm" withPadding>
                    <List.Item>
                      <Text size="sm">
                        Continue using {browserInfo.name} with the limitations above
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text size="sm">Switch to Chrome or Edge for full functionality</Text>
                    </List.Item>
                    {capabilities.hasDragAndDrop && (
                      <List.Item>
                        <Text size="sm">
                          Use drag & drop to add files (recommended for {browserInfo.name})
                        </Text>
                      </List.Item>
                    )}
                  </List>
                </div>
              )}
            </Stack>
          </Collapse>

          <Group gap="sm">
            <Button
              size="xs"
              variant="filled"
              onClick={() => window.open('https://www.google.com/chrome/', '_blank')}
            >
              Get Chrome
            </Button>
            <Button
              size="xs"
              variant="filled"
              onClick={() => window.open('https://www.microsoft.com/edge', '_blank')}
            >
              Get Edge
            </Button>
            <Button size="xs" variant="default" onClick={handleDismiss}>
              Continue with {browserInfo.name}
            </Button>
          </Group>
        </Stack>
      </Alert>
    </div>
  );
}
