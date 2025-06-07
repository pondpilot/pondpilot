import { ActionIcon, Group, Tooltip, Menu, Checkbox, TextInput, Box } from '@mantine/core';
import { supportedDataSourceFileExt } from '@models/file-system';
import {
  IconList,
  IconDatabase,
  IconFile,
  IconCloud,
  IconChevronDown,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { memo, useState, useRef, useEffect } from 'react';

import './data-explorer-filters.css';

export type DataExplorerFilterType = 'all' | 'databases' | 'files' | 'remote';

export type FileTypeFilter = {
  csv: boolean;
  json: boolean;
  parquet: boolean;
  xlsx: boolean;
};

interface FilterButton {
  type: DataExplorerFilterType;
  Icon: Icon;
  tooltip: string;
}

const filterButtons: FilterButton[] = [
  { type: 'all', Icon: IconList, tooltip: 'Show all' },
  { type: 'databases', Icon: IconDatabase, tooltip: 'Show local databases only' },
  { type: 'remote', Icon: IconCloud, tooltip: 'Show remote databases only' },
  { type: 'files', Icon: IconFile, tooltip: 'Show files only' },
];

const fileTypeLabels: Partial<Record<supportedDataSourceFileExt, string>> = {
  csv: 'CSV',
  json: 'JSON',
  parquet: 'Parquet',
  xlsx: 'Excel',
};

interface DataExplorerFiltersProps {
  activeFilter: DataExplorerFilterType;
  onFilterChange: (filter: DataExplorerFilterType) => void;
  fileTypeFilter?: FileTypeFilter;
  onFileTypeFilterChange?: (fileTypes: FileTypeFilter) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const DataExplorerFilters = memo(
  ({
    activeFilter,
    onFilterChange,
    fileTypeFilter = {
      csv: true,
      json: true,
      parquet: true,
      xlsx: true,
    },
    onFileTypeFilterChange,
    searchQuery = '',
    onSearchChange,
  }: DataExplorerFiltersProps) => {
    const [menuOpened, setMenuOpened] = useState(false);
    const [searchExpanded, setSearchExpanded] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const handleFileTypeToggle = (fileType: keyof FileTypeFilter) => {
      if (onFileTypeFilterChange) {
        onFileTypeFilterChange({
          ...fileTypeFilter,
          [fileType]: !fileTypeFilter[fileType],
        });
      }
    };

    const activeFileTypes = Object.entries(fileTypeFilter).filter(([_, enabled]) => enabled);
    const allFileTypesSelected = activeFileTypes.length === 4;
    const someFileTypesSelected = activeFileTypes.length > 0 && activeFileTypes.length < 4;

    useEffect(() => {
      if (searchExpanded && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, [searchExpanded]);

    const handleSearchToggle = () => {
      if (searchExpanded && searchQuery) {
        // Clear search
        onSearchChange?.('');
      } else {
        setSearchExpanded(true);
        // Focus the input after the state update and DOM render
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 0);
      }
    };

    return (
      <Box
        px="xs"
        py={6}
        className="border-b border-gray-200 dark:border-gray-700 flex items-center justify-between relative"
      >
        <Box
          className={cn('filter-buttons-container', searchExpanded && 'hidden')}
          style={{
            // Keep gap for Mantine compatibility
            gap: 4,
          }}
        >
          {filterButtons.map((button) => {
            if (button.type === 'files' && activeFilter === 'files') {
              return (
                <Group key={button.type} gap={0}>
                  <Tooltip label={button.tooltip} position="bottom">
                    <ActionIcon
                      variant="filled"
                      size="sm"
                      onClick={() => onFilterChange(button.type)}
                      aria-label={button.tooltip}
                      className="rounded-r-none"
                    >
                      <button.Icon size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Menu
                    opened={menuOpened}
                    onChange={setMenuOpened}
                    position="bottom-start"
                    closeOnItemClick={false}
                    width={200}
                  >
                    <Menu.Target>
                      <ActionIcon
                        variant="filled"
                        size="sm"
                        className="rounded-l-none border-l border-gray-400 dark:border-gray-600"
                        aria-label="Filter file types"
                      >
                        <IconChevronDown size={14} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>File types</Menu.Label>
                      <Menu.Item
                        onClick={() => {
                          if (onFileTypeFilterChange) {
                            if (allFileTypesSelected) {
                              onFileTypeFilterChange({
                                csv: false,
                                json: false,
                                parquet: false,
                                xlsx: false,
                              });
                            } else {
                              onFileTypeFilterChange({
                                csv: true,
                                json: true,
                                parquet: true,
                                xlsx: true,
                              });
                            }
                          }
                        }}
                      >
                        <Group>
                          <Checkbox
                            checked={allFileTypesSelected}
                            indeterminate={someFileTypesSelected}
                            readOnly
                            size="xs"
                          />
                          <span>All file types</span>
                        </Group>
                      </Menu.Item>
                      <Menu.Divider />
                      {(Object.keys(fileTypeLabels) as (keyof FileTypeFilter)[]).map((fileType) => (
                        <Menu.Item key={fileType} onClick={() => handleFileTypeToggle(fileType)}>
                          <Group>
                            <Checkbox checked={fileTypeFilter[fileType]} readOnly size="xs" />
                            <span>{fileTypeLabels[fileType]}</span>
                          </Group>
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              );
            }

            return (
              <Tooltip key={button.type} label={button.tooltip} position="bottom">
                <ActionIcon
                  variant={activeFilter === button.type ? 'filled' : 'subtle'}
                  size="sm"
                  onClick={() => onFilterChange(button.type)}
                  aria-label={button.tooltip}
                >
                  <button.Icon size={16} />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </Box>

        {searchExpanded && (
          <Box className="search-container">
            <TextInput
              ref={searchInputRef}
              size="xs"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.currentTarget.value)}
              onBlur={() => {
                if (!searchQuery) {
                  setSearchExpanded(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  onSearchChange?.('');
                  setSearchExpanded(false);
                }
              }}
              className="search-input search-input-grow"
              styles={{
                input: {
                  height: 28, // Match ActionIcon sm size
                  minHeight: 28,
                },
              }}
              rightSection={
                searchQuery && (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={() => onSearchChange?.('')}
                    aria-label="Clear search"
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )
              }
            />
          </Box>
        )}

        <Tooltip
          label={searchExpanded && searchQuery ? 'Clear search' : 'Search'}
          position="bottom"
        >
          <ActionIcon
            variant={searchQuery ? 'filled' : 'subtle'}
            size="sm"
            onClick={handleSearchToggle}
            aria-label="Toggle search"
            className="search-toggle-button"
          >
            <IconSearch size={16} />
          </ActionIcon>
        </Tooltip>
      </Box>
    );
  },
);
