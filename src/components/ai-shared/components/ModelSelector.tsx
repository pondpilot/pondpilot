import { Select, SelectProps } from '@mantine/core';
import { getAIConfig } from '@utils/ai-config';
import { navigateToSettings } from '@utils/route-navigation';
import { cn } from '@utils/ui/styles';
import { useMemo } from 'react';

import {
  getAvailableModels,
  getModelDisplayValue,
  ensureValidSelectData,
} from '../utils/model-selector-utils';

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
  const { selectData, hasProviders } = useMemo(() => getAvailableModels(config), [config]);

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
        comboboxProps={{}}
      />
    );
  }

  // Find the current model's display name
  const displayValue = getModelDisplayValue(currentModel, selectData);

  // Ensure data is always a valid array
  const selectDataSafe = ensureValidSelectData(selectData);

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
      }}
      classNames={{
        dropdown: 'max-h-[300px]',
      }}
      allowDeselect={false}
    />
  );
};
