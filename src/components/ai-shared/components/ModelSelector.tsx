import { Select, SelectProps } from '@mantine/core';
import { AI_PROVIDERS } from '@models/ai-service';
import { getAIConfig } from '@utils/ai-config';
import { navigateToSettings } from '@utils/route-navigation';
import { cn } from '@utils/ui/styles';
import { useMemo } from 'react';

interface ModelSelectorProps {
  onModelChange: (model: string) => void;
  compact?: boolean;
  className?: string;
  size?: SelectProps['size'];
  variant?: SelectProps['variant'];
  disabled?: boolean;
  'data-testid'?: string;
}

export const ModelSelector = ({
  onModelChange,
  compact = false,
  className,
  size = 'sm',
  variant = 'default',
  disabled = false,
  'data-testid': dataTestId = 'ai-model-selector',
}: ModelSelectorProps) => {
  const config = getAIConfig();
  const apiKeys = config?.apiKeys || {};
  const currentModel = config?.model || '';

  // Build available models
  const { selectData, hasProviders } = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
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
            config.customModels.forEach((model) => {
              if (model && model.id && model.name) {
                options.push({
                  value: model.id,
                  label: `${provider.name}: ${model.name}`,
                });
              }
            });
          }
        } else if (
          provider.models &&
          Array.isArray(provider.models) &&
          provider.models.length > 0
        ) {
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
  }, [apiKeys, config]);

  // If no providers are logged in, show a button-like select that navigates to settings
  if (!hasProviders) {
    return (
      <Select
        data={[{ value: 'configure', label: 'Configure API Keys →' }]}
        value="configure"
        onChange={() => navigateToSettings()}
        size={size}
        variant={variant}
        disabled={disabled}
        className={cn('cursor-pointer', compact && 'max-w-[200px]', className)}
        data-testid={dataTestId}
        classNames={{
          input: 'cursor-pointer',
        }}
        readOnly
        searchable={false}
        rightSection={null}
        allowDeselect={false}
        comboboxProps={{
          dropdownPosition: 'top',
        }}
      />
    );
  }

  // Find the current model's display name
  const currentModelOption = selectData.find((opt) => opt.value === currentModel);
  const displayValue = currentModelOption ? currentModel : selectData[0]?.value || '';

  // Ensure data is always a valid array
  const selectDataSafe =
    Array.isArray(selectData) && selectData.length > 0
      ? selectData
      : [{ value: 'none', label: 'No models available' }];

  return (
    <Select
      data={selectDataSafe}
      value={displayValue || 'none'}
      onChange={(value) => {
        if (value && value !== 'none') {
          onModelChange(value);
        }
      }}
      size={size}
      variant={variant}
      disabled={disabled || selectData.length === 0}
      placeholder="Select AI model"
      searchable={selectData.length > 5}
      clearable={false}
      className={cn(compact && 'max-w-[200px]', className)}
      data-testid={dataTestId}
      comboboxProps={{
        transitionProps: { transition: 'fade', duration: 200 },
        dropdownPosition: 'top',
      }}
      classNames={{
        dropdown: 'max-h-[300px]',
      }}
      allowDeselect={false}
    />
  );
};
