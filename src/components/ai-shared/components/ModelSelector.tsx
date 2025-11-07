import { Select, SelectProps } from '@mantine/core';
import { getAIConfig } from '@utils/ai-config';
import { navigateToSettings } from '@utils/route-navigation';
import { cn } from '@utils/ui/styles';
import { useEffect, useMemo, useState } from 'react';

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
  const currentModel = config?.model || '';

  // Build available models
  const { selectData, hasProviders } = useMemo(() => getAvailableModels(config), [config]);
  const selectDataSafe = ensureValidSelectData(selectData);
  const initialSelectValue =
    getModelDisplayValue(currentModel, selectDataSafe) || selectDataSafe[0]?.value || 'none';
  const [selectedModel, setSelectedModel] = useState(initialSelectValue);

  useEffect(() => {
    if (!hasProviders) {
      return;
    }

    const fallbackValue = selectDataSafe[0]?.value || 'none';
    const nextValue = getModelDisplayValue(currentModel, selectDataSafe) || fallbackValue;

    setSelectedModel((prev) => {
      const hasOption = selectDataSafe.some((option) => option.value === prev);
      if (!hasOption) {
        return nextValue;
      }

      if (currentModel && currentModel !== prev) {
        return currentModel;
      }

      return prev;
    });
  }, [currentModel, hasProviders, selectDataSafe]);

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
        className={cn('cursor-pointer', compact && 'max-w-[280px]', className)}
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

  return (
    <Select
      data={selectDataSafe}
      value={selectedModel}
      onChange={(value) => {
        if (!value) {
          return;
        }

        setSelectedModel(value);

        if (value !== 'none') {
          onModelChange(value);
        }
      }}
      size={size}
      variant={variant}
      disabled={disabled || selectData.length === 0}
      placeholder="Select AI model"
      searchable={selectData.length > 5}
      clearable={false}
      className={cn(compact && 'max-w-[280px]', className)}
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
