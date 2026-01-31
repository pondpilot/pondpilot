import { ActionIcon, Group, Tooltip, Menu, Checkbox, TextInput, Box } from '@mantine/core';
import { supportedDataSourceFileExt } from '@models/file-system';
import {
  IconListCheck,
  IconDatabase,
  IconFile,
  IconCloud,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { memo, useState, useRef, useEffect, useMemo } from 'react';

import './data-explorer-filters.css';

export type DataExplorerFilterType = 'all' | 'databases' | 'files' | 'remote';

export type FileTypeFilter = {
  csv: boolean;
  json: boolean;
  parquet: boolean;
  xlsx: boolean;
  sas7bdat: boolean;
  xpt: boolean;
  sav: boolean;
  zsav: boolean;
  por: boolean;
  dta: boolean;
};

interface FilterButton {
  type: DataExplorerFilterType;
  Icon: Icon;
  tooltip: string;
}

const allFilterButtons: FilterButton[] = [
  { type: 'all', Icon: IconListCheck, tooltip: 'Show all' },
  { type: 'files', Icon: IconFile, tooltip: 'Files' },
  { type: 'databases', Icon: IconDatabase, tooltip: 'Local databases' },
  { type: 'remote', Icon: IconCloud, tooltip: 'Remote databases' },
];

const fileTypeLabels: Partial<Record<supportedDataSourceFileExt, string>> = {
  csv: 'CSV',
  json: 'JSON',
  parquet: 'Parquet',
  xlsx: 'Excel',
  sas7bdat: 'SAS',
  xpt: 'SAS XPT',
  sav: 'SPSS',
  zsav: 'SPSS (Z)',
  por: 'SPSS (POR)',
  dta: 'Stata',
};

interface DataExplorerFiltersProps {
  activeFilter: DataExplorerFilterType;
  onFilterChange: (filter: DataExplorerFilterType) => void;
  fileTypeFilter?: FileTypeFilter;
  onFileTypeFilterChange?: (fileTypes: FileTypeFilter) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  availableFileTypes?: Set<keyof FileTypeFilter>;
  availableDataSourceTypes: {
    files: boolean;
    databases: boolean;
    remote: boolean;
  };
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
      sas7bdat: true,
      xpt: true,
      sav: true,
      zsav: true,
      por: true,
      dta: true,
    },
    onFileTypeFilterChange,
    searchQuery = '',
    onSearchChange,
    availableFileTypes,
    availableDataSourceTypes,
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

    // Calculate selection state based on available types
    const availableTypesCount = availableFileTypes?.size || Object.keys(fileTypeLabels).length;
    const activeAvailableTypes = activeFileTypes.filter(
      ([type]) => !availableFileTypes || availableFileTypes.has(type as keyof FileTypeFilter),
    );
    const allFileTypesSelected = activeAvailableTypes.length === availableTypesCount;
    const someFileTypesSelected =
      activeAvailableTypes.length > 0 && activeAvailableTypes.length < availableTypesCount;

    // Filter buttons based on available data source types
    const visibleFilterButtons = useMemo(() => {
      const buttons: FilterButton[] = [];

      // Always show "all" if there's at least one data source type
      const hasAnyDataSource =
        availableDataSourceTypes.files ||
        availableDataSourceTypes.databases ||
        availableDataSourceTypes.remote;

      if (!hasAnyDataSource) {
        return allFilterButtons;
      }

      if (hasAnyDataSource) {
        buttons.push(allFilterButtons[0]); // "all" button
      }

      // Add other buttons based on availability
      if (availableDataSourceTypes.files) {
        buttons.push(allFilterButtons.find((b) => b.type === 'files')!);
      }
      if (availableDataSourceTypes.databases) {
        buttons.push(allFilterButtons.find((b) => b.type === 'databases')!);
      }
      if (availableDataSourceTypes.remote) {
        buttons.push(allFilterButtons.find((b) => b.type === 'remote')!);
      }

      return buttons;
    }, [availableDataSourceTypes]);

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
        data-testid={setDataTestId('data-explorer-filters')}
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
          {visibleFilterButtons.map((button) => {
            if (button.type === 'files') {
              return (
                <Menu
                  key={button.type}
                  opened={menuOpened}
                  onChange={setMenuOpened}
                  position="bottom-start"
                  closeOnItemClick={false}
                  width={200}
                >
                  <Menu.Target>
                    <Tooltip
                      label={button.tooltip}
                      position="bottom"
                      openDelay={500}
                      disabled={menuOpened}
                    >
                      <ActionIcon
                        size={20}
                        color={activeFilter === 'files' ? 'background-accent' : undefined}
                        onClick={() => {
                          onFilterChange(button.type);
                          setMenuOpened(true);
                        }}
                        aria-label={button.tooltip}
                        data-active={activeFilter === 'files'}
                        data-testid={setDataTestId('file-type-filter')}
                      >
                        <button.Icon size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>File types</Menu.Label>
                    <Menu.Item
                      onClick={() => {
                        if (onFileTypeFilterChange) {
                          const newFilter = { ...fileTypeFilter };

                          if (allFileTypesSelected) {
                            // Deselect all available types
                            if (availableFileTypes) {
                              availableFileTypes.forEach((type) => {
                                newFilter[type] = false;
                              });
                            } else {
                              // Fallback to deselect all
                              newFilter.csv = false;
                              newFilter.json = false;
                              newFilter.parquet = false;
                              newFilter.xlsx = false;
                            }
                          } else if (availableFileTypes) {
                            // Select all available types
                            availableFileTypes.forEach((type) => {
                              newFilter[type] = true;
                            });
                          } else {
                            // Fallback to select all
                            newFilter.csv = true;
                            newFilter.json = true;
                            newFilter.parquet = true;
                            newFilter.xlsx = true;
                          }

                          onFileTypeFilterChange(newFilter);
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
                    {(Object.keys(fileTypeLabels) as (keyof FileTypeFilter)[])
                      .filter((fileType) => !availableFileTypes || availableFileTypes.has(fileType))
                      .map((fileType) => (
                        <Menu.Item key={fileType} onClick={() => handleFileTypeToggle(fileType)}>
                          <Group>
                            <Checkbox checked={fileTypeFilter[fileType]} readOnly size="xs" />
                            <span>{fileTypeLabels[fileType]}</span>
                          </Group>
                        </Menu.Item>
                      ))}
                  </Menu.Dropdown>
                </Menu>
              );
            }

            return (
              <Tooltip key={button.type} label={button.tooltip} position="bottom" openDelay={500}>
                <ActionIcon
                  size={20}
                  color={activeFilter === button.type ? 'background-accent' : undefined}
                  onClick={() => onFilterChange(button.type)}
                  aria-label={button.tooltip}
                  data-active={activeFilter === button.type}
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
              className="w-full"
              styles={{
                input: {
                  height: 20,
                  minHeight: 20,
                },
              }}
              rightSection={
                searchQuery && (
                  <ActionIcon
                    size="xs"
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
          openDelay={500}
        >
          <ActionIcon
            size={20}
            onClick={handleSearchToggle}
            aria-label="Toggle search"
            className="relative z-10"
          >
            <IconSearch size={16} />
          </ActionIcon>
        </Tooltip>
      </Box>
    );
  },
);
