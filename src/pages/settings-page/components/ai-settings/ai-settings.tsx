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
  TextInput,
  Radio,
  ActionIcon,
  Checkbox,
} from '@mantine/core';
import {
  IconInfoCircle,
  IconShieldCheck,
  IconCheck,
  IconX,
  IconTrash,
  IconPlus,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';

import { AI_PROVIDERS, AIServiceConfig, AIModel } from '@models/ai-service';
import { getAIConfig, saveAIConfig } from '@utils/ai-config';
import { getAIService } from '@utils/ai-service';

export const AISettings = () => {
  const [config, setConfig] = useState<AIServiceConfig>(() => getAIConfig());
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{
    testing: boolean;
    result: { success: boolean; message: string } | null;
  }>({
    testing: false,
    result: null,
  });

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

          // Handle custom provider
          if (value === 'custom') {
            const customModels = prev.customModels || [
              { id: 'custom-model-1', name: 'Model 1', description: '' },
            ];
            return {
              ...prev,
              provider: value,
              model: customModels[0].id,
              apiKey: newProviderApiKey,
              apiKeys,
              customAuthType: prev.customAuthType || 'bearer',
            };
          }

          return {
            ...prev,
            provider: value,
            model: provider.models[0].id, // Reset to first model of new provider
            apiKey: newProviderApiKey,
            apiKeys,
          };
        });
        setHasChanges(true);
        setTestStatus({ testing: false, result: null });
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
    setTestStatus({ testing: false, result: null }); // Reset test status when config changes
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
    setTestStatus({ testing: false, result: null });
  }, []);

  const handleTestConnection = useCallback(async () => {
    setTestStatus({ testing: true, result: null });

    // Create a temporary AI service instance with current config
    const aiService = getAIService(config);

    try {
      const result = await aiService.testConnection();
      setTestStatus({ testing: false, result });
    } catch (error) {
      setTestStatus({
        testing: false,
        result: {
          success: false,
          message: error instanceof Error ? error.message : 'Test failed',
        },
      });
    }
  }, [config]);

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
  const models =
    config.provider === 'custom' ? config.customModels || [] : currentProvider?.models || [];
  const currentModel = models.find((m) => m.id === config.model);

  const handleCustomEndpointChange = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, customEndpoint: value }));
    setHasChanges(true);
    setTestStatus({ testing: false, result: null });
  }, []);

  const handleCustomAuthTypeChange = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, customAuthType: value as 'bearer' | 'x-api-key' }));
    setHasChanges(true);
    setTestStatus({ testing: false, result: null });
  }, []);

  const handleCustomSupportsToolsChange = useCallback((checked: boolean) => {
    setConfig((prev) => ({ ...prev, customSupportsTools: checked }));
    setHasChanges(true);
  }, []);

  const handleAddCustomModel = useCallback(() => {
    setConfig((prev) => {
      const customModels = prev.customModels || [];
      const newModel: AIModel = {
        id: `custom-model-${Date.now()}`,
        name: `Model ${customModels.length + 1}`,
        description: '',
      };
      return {
        ...prev,
        customModels: [...customModels, newModel],
        model: prev.model || newModel.id,
      };
    });
    setHasChanges(true);
  }, []);

  const handleRemoveCustomModel = useCallback((modelId: string) => {
    setConfig((prev) => {
      const customModels = (prev.customModels || []).filter((m) => m.id !== modelId);
      return {
        ...prev,
        customModels,
        model: prev.model === modelId && customModels.length > 0 ? customModels[0].id : prev.model,
      };
    });
    setHasChanges(true);
  }, []);

  const handleCustomModelChange = useCallback(
    (modelId: string, field: keyof AIModel, value: string) => {
      setConfig((prev) => {
        const customModels = (prev.customModels || []).map((m) =>
          m.id === modelId ? { ...m, [field]: value } : m,
        );
        return { ...prev, customModels };
      });
      setHasChanges(true);
    },
    [],
  );

  // Helper to render API key status badges
  const renderApiKeyStatus = () => {
    const apiKeys = config.apiKeys || {};

    return (
      <Group gap="xs" wrap="wrap">
        {AI_PROVIDERS.map((provider) => {
          const hasKey = Boolean(apiKeys[provider.id]);
          // For custom provider, also check if endpoint is configured
          const isConfigured =
            provider.id === 'custom' ? hasKey && Boolean(config.customEndpoint) : hasKey;

          return (
            <Group key={provider.id} gap={4}>
              <Badge
                variant={isConfigured ? 'filled' : 'light'}
                color={isConfigured ? 'green' : 'gray'}
                leftSection={isConfigured ? <IconCheck size={12} /> : <IconX size={12} />}
                size="sm"
              >
                {provider.name}
                {isConfigured ? '' : ': Not set'}
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

        {currentProvider && config.provider === 'custom' ? (
          <Stack gap="sm">
            <TextInput
              label="Endpoint URL"
              description="The base URL for your OpenAI-compatible API (e.g., https://api.example.com/v1)"
              placeholder="https://api.example.com/v1"
              value={config.customEndpoint || ''}
              onChange={(event) => handleCustomEndpointChange(event.currentTarget.value)}
              required
            />

            <Radio.Group
              label="Authentication Type"
              description="How the API expects the authentication token"
              value={config.customAuthType || 'bearer'}
              onChange={handleCustomAuthTypeChange}
            >
              <Group mt="xs">
                <Radio value="bearer" label="Bearer Token (OpenAI style)" />
                <Radio value="x-api-key" label="X-API-Key Header (Anthropic style)" />
              </Group>
            </Radio.Group>

            <Box>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={500}>
                  Custom Models
                </Text>
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconPlus size={14} />}
                  onClick={handleAddCustomModel}
                >
                  Add Model
                </Button>
              </Group>
              <Stack gap="xs">
                {(config.customModels || []).map((model) => (
                  <Group key={model.id} gap="xs" align="flex-start">
                    <TextInput
                      placeholder="Model ID"
                      value={model.id}
                      onChange={(e) =>
                        handleCustomModelChange(model.id, 'id', e.currentTarget.value)
                      }
                      className="flex-1"
                      size="sm"
                    />
                    <TextInput
                      placeholder="Model Name"
                      value={model.name}
                      onChange={(e) =>
                        handleCustomModelChange(model.id, 'name', e.currentTarget.value)
                      }
                      className="flex-1"
                      size="sm"
                    />
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => handleRemoveCustomModel(model.id)}
                      disabled={(config.customModels || []).length === 1}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            </Box>

            <Select
              label="Model"
              description="Select which model to use"
              value={config.model}
              onChange={handleModelChange}
              data={(config.customModels || []).map((model) => ({
                value: model.id,
                label: model.name,
              }))}
            />

            <Checkbox
              label="Supports function calling (tool use)"
              description="Uncheck if your endpoint doesn't support OpenAI-style function calling"
              checked={config.customSupportsTools !== false}
              onChange={(event) => handleCustomSupportsToolsChange(event.currentTarget.checked)}
            />
          </Stack>
        ) : currentProvider ? (
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
        ) : null}

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

        {testStatus.result && (
          <Alert
            color={testStatus.result.success ? 'green' : 'red'}
            variant="light"
            icon={testStatus.result.success ? <IconCheck size={16} /> : <IconX size={16} />}
          >
            <Text size="sm">{testStatus.result.message}</Text>
          </Alert>
        )}

        <Group justify="flex-start" className="mt-2">
          {hasChanges && (
            <>
              <Button onClick={handleSave} size="sm">
                Save Changes
              </Button>
              <Button onClick={handleReset} variant="outline" size="sm">
                Reset
              </Button>
            </>
          )}
          <Button
            onClick={handleTestConnection}
            variant="light"
            size="sm"
            loading={testStatus.testing}
            disabled={!config.apiKey || (config.provider === 'custom' && !config.customEndpoint)}
          >
            Test Connection
          </Button>
        </Group>

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
