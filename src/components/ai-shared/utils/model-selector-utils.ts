import { AI_PROVIDERS, AIServiceConfig } from '@models/ai-service';

export interface ModelOption {
  value: string;
  label: string;
}

export interface AvailableModels {
  selectData: ModelOption[];
  hasProviders: boolean;
}

/**
 * Get available models based on configured API keys
 */
export function getAvailableModels(config: AIServiceConfig | null): AvailableModels {
  const apiKeys = config?.apiKeys || {};
  const options: ModelOption[] = [];
  let providersFound = false;

  if (!AI_PROVIDERS || !Array.isArray(AI_PROVIDERS)) {
    console.error('AI_PROVIDERS is not available or not an array');
    return { selectData: [], hasProviders: false };
  }

  AI_PROVIDERS.forEach((provider) => {
    if (!provider || !provider.id) return;

    const hasApiKey = apiKeys && apiKeys[provider.id] && apiKeys[provider.id].trim() !== '';
    if (hasApiKey) {
      providersFound = true;

      // Handle custom provider with custom models
      if (provider.id === 'custom') {
        if (
          config &&
          config.customModels &&
          Array.isArray(config.customModels) &&
          config.customModels.length > 0
        ) {
          config.customModels.forEach((model: any) => {
            if (model && model.id && model.name) {
              options.push({
                value: model.id,
                label: `${provider.name}: ${model.name}`,
              });
            }
          });
        }
      } else if (provider.models && Array.isArray(provider.models) && provider.models.length > 0) {
        // Add regular provider models
        provider.models.forEach((model) => {
          if (model && model.id && model.name) {
            options.push({
              value: model.id,
              label: `${provider.name}: ${model.name}`,
            });
          }
        });
      }
    }
  });

  return { selectData: options, hasProviders: providersFound };
}

/**
 * Get the display value for the current model
 */
export function getModelDisplayValue(currentModel: string, selectData: ModelOption[]): string {
  const currentModelOption = selectData.find((opt) => opt.value === currentModel);
  return currentModelOption ? currentModel : selectData[0]?.value || '';
}

/**
 * Ensure select data is valid
 */
export function ensureValidSelectData(selectData: ModelOption[]): ModelOption[] {
  return Array.isArray(selectData) && selectData.length > 0
    ? selectData
    : [{ value: 'none', label: 'No models available' }];
}
