import {
  Combobox,
  TextInput,
  useCombobox,
  Text,
  ScrollArea,
  TextInputProps,
  Group,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { forwardRef, useState, useMemo } from 'react';

interface CreatableSelectProps extends Omit<TextInputProps, 'onChange' | 'value'> {
  data: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
  onCreate?: (value: string) => void;
  searchable?: boolean;
  placeholder?: string;
  creatable?: boolean;
  createLabel?: (query: string) => string;
  nothingFoundMessage?: string;
  maxDropdownHeight?: number;
}

export const CreatableSelect = forwardRef<HTMLInputElement, CreatableSelectProps>(
  (
    {
      data,
      value,
      onChange,
      onCreate,
      searchable = true,
      placeholder,
      creatable = true,
      createLabel = (query) => `+ Create "${query}"`,
      nothingFoundMessage = 'Nothing found',
      maxDropdownHeight = 200,
      ...inputProps
    },
    ref,
  ) => {
    const combobox = useCombobox({
      onDropdownClose: () => {
        combobox.resetSelectedOption();
        setSearch('');
      },
      onDropdownOpen: () => {
        combobox.focusTarget();
      },
    });

    const [search, setSearch] = useState('');

    const filteredOptions = useMemo(() => {
      const filtered = searchable
        ? data.filter((item) => item.label.toLowerCase().includes(search.toLowerCase().trim()))
        : data;

      return filtered;
    }, [data, search, searchable]);

    const exactMatch = useMemo(
      () => data.some((item) => item.value === search.trim()),
      [data, search],
    );

    const shouldShowCreate = creatable && search.trim() && !exactMatch;

    const selectedOption = data.find((item) => item.value === value);
    const displayValue = selectedOption?.label || value || '';

    const handleOptionSubmit = (optionValue: string) => {
      if (optionValue === '__create__') {
        const newValue = search.trim();
        if (onCreate) {
          onCreate(newValue);
        }
        if (onChange) {
          onChange(newValue);
        }
      } else if (onChange) {
        onChange(optionValue);
      }
      combobox.closeDropdown();
    };

    const options = filteredOptions.map((item) => (
      <Combobox.Option value={item.value} key={item.value}>
        {item.label}
      </Combobox.Option>
    ));

    return (
      <Combobox store={combobox} onOptionSubmit={handleOptionSubmit} withinPortal>
        <Combobox.Target targetType={searchable ? 'input' : 'button'}>
          <TextInput
            ref={ref}
            placeholder={placeholder}
            value={searchable && combobox.dropdownOpened ? search : displayValue}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              combobox.openDropdown();
              combobox.updateSelectedOptionIndex();
            }}
            onClick={() => combobox.toggleDropdown()}
            onFocus={() => {
              if (searchable) {
                combobox.openDropdown();
              }
            }}
            onBlur={() => {
              setSearch('');
              combobox.closeDropdown();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && search.trim() && !exactMatch && creatable) {
                event.preventDefault();
                event.stopPropagation();
                handleOptionSubmit('__create__');
              }
            }}
            rightSection={<Combobox.Chevron />}
            rightSectionPointerEvents="none"
            {...inputProps}
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          <ScrollArea.Autosize type="scroll" mah={maxDropdownHeight}>
            {options.length > 0 || shouldShowCreate ? (
              <>
                {shouldShowCreate && (
                  <Combobox.Option value="__create__">
                    <Group gap="xs">
                      <IconPlus size={16} />
                      <Text>{createLabel(search)}</Text>
                    </Group>
                  </Combobox.Option>
                )}
                {options}
              </>
            ) : (
              <Combobox.Empty>{nothingFoundMessage}</Combobox.Empty>
            )}
          </ScrollArea.Autosize>
        </Combobox.Dropdown>
      </Combobox>
    );
  },
);

CreatableSelect.displayName = 'CreatableSelect';
