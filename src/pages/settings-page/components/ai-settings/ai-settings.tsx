import {
  Alert,
  Box,
  Button,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  Title,
  Badge,
} from '@mantine/core';
import { IconInfoCircle, IconShieldCheck, IconCheck, IconX, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';

import { AI_PROVIDERS, AIServiceConfig } from '../../../../models/ai-service';
import { getAIConfig, saveAIConfig } from '../../../../utils/ai-config';

export const AISettings = () => {
  const [config, setConfig] = useState<AIServiceConfig>(() => getAIConfig());
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getAIConfig();
    setConfig(stored);
  }, []);

  const handleProviderChange = useCallback((value: string | null) => {
    if (value) {
      const provider = AI_PROVIDERS.find((p) => p.id === value);
      if (provider) {
        setConfig((prev) => {
          // Ensure apiKeys exists
          const apiKeys = prev.apiKeys || {};

          // Save current API key for the current provider
          if (prev.apiKey && prev.provider) {
            apiKeys[prev.provider] = prev.apiKey;
          }

          // Get the saved API key for the new provider
          const newProviderApiKey = apiKeys[value] || '';

          return {
            ...prev,
            provider: value,
            model: provider.models[0].id, // Reset to first model of new provider
            apiKey: newProviderApiKey,
            apiKeys,
          };
        });
        setHasChanges(true);
      }
    }
  }, []);

  const handleModelChange = useCallback((value: string | null) => {
    if (value) {
      setConfig((prev) => ({ ...prev, model: value }));
      setHasChanges(true);
    }
  }, []);

  const handleApiKeyChange = useCallback((value: string) => {
    setConfig((prev) => {
      // Ensure apiKeys exists
      const apiKeys = prev.apiKeys || {};

      // Update both the current apiKey and the provider-specific key
      apiKeys[prev.provider] = value;

      return {
        ...prev,
        apiKey: value,
        apiKeys,
      };
    });
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    try {
      saveAIConfig(config);
      setHasChanges(false);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save configuration');
    }
  }, [config]);

  const handleReset = useCallback(() => {
    const stored = getAIConfig();
    setConfig(stored);
    setHasChanges(false);
    setSaveError(null);
  }, []);

  const handleClearProviderKey = useCallback((providerId: string) => {
    setConfig((prev) => {
      const apiKeys = { ...(prev.apiKeys || {}) };
      delete apiKeys[providerId];

      return {
        ...prev,
        apiKeys,
        // If clearing the current provider's key, also clear the main apiKey
        apiKey: providerId === prev.provider ? '' : prev.apiKey,
      };
    });
    setHasChanges(true);
  }, []);

  const currentProvider = AI_PROVIDERS.find((p) => p.id === config.provider);
  const currentModel = currentProvider?.models.find((m) => m.id === config.model);

  // Helper to render API key status badges
  const renderApiKeyStatus = () => {
    const apiKeys = config.apiKeys || {};

    return (
      <Group gap="xs" wrap="wrap">
        {AI_PROVIDERS.map((provider) => {
          const hasKey = Boolean(apiKeys[provider.id]);
          return (
            <Group key={provider.id} gap={4}>
              <Badge
                variant={hasKey ? 'filled' : 'light'}
                color={hasKey ? 'green' : 'gray'}
                leftSection={hasKey ? <IconCheck size={12} /> : <IconX size={12} />}
                size="sm"
              >
                {provider.name}: {hasKey ? 'Saved' : 'Not set'}
              </Badge>
              {hasKey && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => handleClearProviderKey(provider.id)}
                  p={2}
                >
                  <IconTrash size={12} />
                </Button>
              )}
            </Group>
          );
        })}
      </Group>
    );
  };

  return (
    <Stack>
      <Box>
        <Title c="text-primary" order={3}>
          AI Assistant
        </Title>
        <Text c="text-secondary">
          Configure AI assistance for SQL queries. Requires an API key from your chosen provider.
        </Text>
      </Box>

      <Stack className="gap-4">
        <Select
          label="AI Provider"
          description="Choose your AI service provider"
          value={config.provider}
          onChange={handleProviderChange}
          data={AI_PROVIDERS.map((provider) => ({
            value: provider.id,
            label: provider.name,
          }))}
        />

        {currentProvider && (
          <Select
            label="Model"
            description={currentModel?.description || 'Choose a model for AI assistance'}
            value={config.model}
            onChange={handleModelChange}
            data={currentProvider.models.map((model) => ({
              value: model.id,
              label: model.name,
            }))}
          />
        )}

        <PasswordInput
          label="API Key"
          description={`Enter your ${currentProvider?.name || 'AI provider'} API key`}
          placeholder="sk-..."
          value={config.apiKey}
          onChange={(event) => handleApiKeyChange(event.currentTarget.value)}
        />

        <Box>
          <Text size="sm" c="text-secondary" mb="xs">
            Saved API Keys:
          </Text>
          {renderApiKeyStatus()}
        </Box>

        <Alert icon={<IconShieldCheck size={16} />} color="blue" variant="light">
          <Text size="sm">
            <strong>Privacy Notice:</strong> When using AI assistance, your SQL queries and database
            schema information are sent to {currentProvider?.name || 'the selected AI provider'}.
            Ensure this complies with your organization&apos;s data privacy policies. API keys are
            securely stored in your browser&apos;s cookies.
          </Text>
        </Alert>

        {saveError && (
          <Alert color="red" variant="light">
            <Text size="sm">{saveError}</Text>
          </Alert>
        )}

        {hasChanges && (
          <Group justify="flex-start" className="mt-2">
            <Button onClick={handleSave} size="sm">
              Save Changes
            </Button>
            <Button onClick={handleReset} variant="outline" size="sm">
              Reset
            </Button>
          </Group>
        )}

        {!config.apiKey && (
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            <Text size="sm">
              The AI assistant will be available once you configure an API key. You can obtain an
              API key from your chosen AI provider&apos;s dashboard.
            </Text>
          </Alert>
        )}
      </Stack>
    </Stack>
  );
};
