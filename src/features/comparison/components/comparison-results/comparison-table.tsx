import { NamedIcon } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { useAppTheme } from '@hooks/use-app-theme';
import {
  useMantineTheme,
  ActionIcon,
  Popover,
  TextInput,
  Tooltip,
  Text,
  Group,
} from '@mantine/core';
import { ColumnSortSpecList, DataRow, DBColumn } from '@models/db';
import {
  IconTriangleInvertedFilled,
  IconFilter,
  IconFilterFilled,
  IconX,
} from '@tabler/icons-react';
import { stringifyTypedValue } from '@utils/db';
import { cn } from '@utils/ui/styles';
import { Fragment, ReactNode, useMemo, useState, useLayoutEffect, useRef } from 'react';

import {
  getStatusAccentColor,
  getStatusSurfaceColor,
  isComparisonRowStatus,
} from '../../utils/theme';

export type ColumnDiffStats = {
  total: number;
  added: number;
  removed: number;
  modified: number;
  same: number;
};

export type ComparisonJoinColumn = {
  column: DBColumn;
  sortColumnName: string;
};

export type ComparisonValueColumn = {
  displayName: string;
  columnA: DBColumn;
  columnB: DBColumn;
  statusColumn: DBColumn;
  diffStats: ColumnDiffStats;
};

interface ComparisonResultsTableProps {
  rows: DataRow[];
  joinColumns: ComparisonJoinColumn[];
  valueColumns: ComparisonValueColumn[];
  rowStatusColumn: DBColumn | null;
  sort: ColumnSortSpecList;
  onSort: (columnId: string) => void;
  columnFilters: Record<string, string>;
  onFilterChange: (columnId: string, value: string) => void;
  scrollOffset: number;
  onScrollChange: (scrollLeft: number) => void;
}

const statusOrderLabel: Record<string, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  same: 'Unchanged',
};

const renderValue = (value: unknown, column: DBColumn): ReactNode => {
  const { formattedValue, type } = stringifyTypedValue({
    type: column.sqlType,
    value,
  });

  return (
    <span
      className={cn(
        'whitespace-nowrap',
        type === 'null' && 'italic text-textSecondary-light dark:text-textSecondary-dark',
        type === 'error' && 'text-backgroundError-dark',
      )}
    >
      {formattedValue}
    </span>
  );
};

const getSortOrder = (sort: ColumnSortSpecList, columnId: string) =>
  sort.find((s) => s.column === columnId)?.order ?? null;

const SortButton = ({
  activeOrder,
  onClick,
}: {
  activeOrder: 'asc' | 'desc' | null;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group p-1 -m-1 rounded transition-colors',
        'text-iconDefault-light dark:text-iconDefault-dark hover:bg-transparent004-light dark:hover:bg-transparent004-dark',
      )}
      aria-label={
        activeOrder === 'asc'
          ? 'Sort ascending'
          : activeOrder === 'desc'
            ? 'Sort descending'
            : 'Sort column'
      }
    >
      <IconTriangleInvertedFilled
        size={8}
        className={cn(
          'transition-transform transition-opacity duration-150',
          activeOrder ? 'opacity-100' : 'opacity-40 group-hover:opacity-80',
          activeOrder === 'asc' && 'rotate-180',
        )}
      />
    </button>
  );
};

export const ComparisonResultsTable = ({
  rows,
  joinColumns,
  valueColumns,
  rowStatusColumn,
  sort,
  onSort,
  columnFilters,
  onFilterChange,
  scrollOffset,
  onScrollChange,
}: ComparisonResultsTableProps) => {
  const theme = useMantineTheme();
  const colorScheme = useAppTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAppliedOffsetRef = useRef(scrollOffset);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const next = Math.max(scrollOffset, 0);
    if (Math.abs(node.scrollLeft - next) > 0.5) {
      node.scrollLeft = next;
    }
    lastAppliedOffsetRef.current = next;
  }, [scrollOffset]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handleScroll = () => {
      const current = node.scrollLeft;
      lastAppliedOffsetRef.current = current;
      onScrollChange(current);
    };
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [onScrollChange]);

  const columnDiffPercentages = useMemo(
    () =>
      new Map(
        valueColumns.map((column) => {
          const diff =
            column.diffStats.total === 0
              ? 0
              : Math.round(
                  ((column.diffStats.added + column.diffStats.removed + column.diffStats.modified) /
                    column.diffStats.total) *
                    100,
                );
          return [column.displayName, diff];
        }),
      ),
    [valueColumns],
  );

  const buildDiffSegments = (column: ComparisonValueColumn) => {
    if (column.diffStats.total === 0) {
      return [{ value: 100, color: 'transparent' }];
    }
    const { added, removed, modified, same: _same, total } = column.diffStats;
    const toPercent = (value: number) => Math.round((value / total) * 100);
    const segments: Array<{ value: number; color: string | undefined }> = [];
    if (added > 0) {
      segments.push({
        value: toPercent(added),
        color: getStatusAccentColor(theme, 'added', colorScheme, colorScheme === 'dark' ? 4 : 6),
      });
    }
    if (removed > 0) {
      segments.push({
        value: toPercent(removed),
        color: getStatusAccentColor(theme, 'removed', colorScheme, colorScheme === 'dark' ? 4 : 6),
      });
    }
    if (modified > 0) {
      segments.push({
        value: toPercent(modified),
        color: getStatusAccentColor(theme, 'modified', colorScheme, colorScheme === 'dark' ? 4 : 6),
      });
    }
    const matched = total - (added + removed + modified);
    if (matched > 0) {
      segments.push({
        value: toPercent(matched),
        color: getStatusAccentColor(theme, 'same', colorScheme, colorScheme === 'dark' ? 5 : 4),
      });
    }
    return segments;
  };

  const getColumnIcon = (column: DBColumn) => getIconTypeForSQLType(column.sqlType);

  const renderTypeBadge = (column: DBColumn) => (
    <span className="text-[10px] uppercase tracking-wide text-textSecondary-light dark:text-textSecondary-dark">
      {column.databaseType}
    </span>
  );

  const ColumnFilterButton = ({
    columnId,
    value,
    onChange,
    label,
  }: {
    columnId: string;
    value: string;
    onChange: (columnId: string, value: string) => void;
    label: string;
  }) => {
    const [opened, setOpened] = useState(false);
    const trimmed = value.trim();
    const isActive = trimmed.length > 0;

    return (
      <Popover
        withArrow
        shadow="md"
        trapFocus
        position="bottom-end"
        opened={opened}
        onChange={setOpened}
      >
        <Popover.Target>
          <Tooltip withArrow label={isActive ? 'Edit filter' : 'Filter column'}>
            <ActionIcon
              variant={isActive ? 'filled' : 'subtle'}
              color={isActive ? 'accent' : 'gray'}
              size="sm"
              onClick={() => setOpened((prev) => !prev)}
            >
              {isActive ? <IconFilterFilled size={12} /> : <IconFilter size={12} />}
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown maw={220}>
          <Text size="xs" fw={600} mb={4} c="dimmed">
            Filter {label}
          </Text>
          <TextInput
            value={value}
            onChange={(event) => onChange(columnId, event.currentTarget.value)}
            placeholder="Contains…"
            size="xs"
            autoFocus
            rightSection={
              trimmed ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={() => {
                    onChange(columnId, '');
                    setOpened(false);
                  }}
                >
                  <IconX size={12} />
                </ActionIcon>
              ) : null
            }
            rightSectionPointerEvents="all"
          />
        </Popover.Dropdown>
      </Popover>
    );
  };

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto custom-scroll-hidden border border-borderLight-light dark:border-borderLight-dark rounded-lg shadow-sm"
    >
      <table className="border-collapse min-w-full w-max">
        <thead className="bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark text-xs uppercase tracking-wide text-textSecondary-light dark:text-textSecondary-dark">
          <tr className="border-b border-borderLight-light dark:border-borderLight-dark">
            <th className="w-12 px-3 py-2 text-left" rowSpan={2}>
              #
            </th>
            {rowStatusColumn ? (
              <th className="w-32 min-w-[140px] px-3 py-2 text-left font-semibold" rowSpan={2}>
                <div className="flex items-center gap-1">
                  <span>Status</span>
                  <SortButton
                    activeOrder={getSortOrder(sort, rowStatusColumn.name)}
                    onClick={() => onSort(rowStatusColumn.name)}
                  />
                </div>
              </th>
            ) : null}
            {joinColumns.map(({ column, sortColumnName }) => {
              const filterValue = columnFilters[column.id] ?? '';
              return (
                <th
                  key={column.id}
                  rowSpan={2}
                  className="px-3 py-2 text-left font-semibold align-bottom min-w-[180px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-textPrimary-light dark:text-textPrimary-dark">
                      <NamedIcon iconType={getColumnIcon(column)} size={14} />
                      <span>{column.name}</span>
                    </div>
                    <Group gap={4} align="center">
                      <SortButton
                        activeOrder={getSortOrder(sort, sortColumnName)}
                        onClick={() => onSort(sortColumnName)}
                      />
                      <ColumnFilterButton
                        columnId={column.id}
                        value={filterValue}
                        onChange={onFilterChange}
                        label={column.name}
                      />
                    </Group>
                  </div>
                  <div className="mt-1">{renderTypeBadge(column)}</div>
                </th>
              );
            })}
            {valueColumns.map((column) => {
              const diffPercentage = columnDiffPercentages.get(column.displayName) ?? 0;
              const barColor =
                diffPercentage > 0
                  ? getStatusAccentColor(
                      theme,
                      'modified',
                      colorScheme,
                      colorScheme === 'dark' ? 3 : 5,
                    )
                  : 'transparent';
              const segments = buildDiffSegments(column);
              return (
                <th
                  key={column.displayName}
                  colSpan={2}
                  className="px-3 py-2 font-semibold min-w-[240px]"
                >
                  <div className="flex items-center justify-between text-textPrimary-light dark:text-textPrimary-dark">
                    <div className="flex items-center gap-2">
                      <NamedIcon iconType={getColumnIcon(column.columnA)} size={14} />
                      <span className="capitalize">{column.displayName}</span>
                    </div>
                    <SortButton
                      activeOrder={getSortOrder(sort, column.columnA.name)}
                      onClick={() => onSort(column.columnA.name)}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span>Differences</span>
                    <span>{diffPercentage}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-transparent008-light dark:bg-transparent008-dark overflow-hidden flex">
                    {segments.map((segment, idx) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={`${column.displayName}-segment-${idx}`}
                        style={{
                          width: `${segment.value}%`,
                          backgroundColor: segment.color ?? barColor,
                        }}
                        className="h-full transition-[width]"
                      />
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] text-textSecondary-light dark:text-textSecondary-dark flex gap-3">
                    <span>A: {column.columnA.databaseType}</span>
                    <span>B: {column.columnB.databaseType}</span>
                  </div>
                </th>
              );
            })}
          </tr>
          <tr className="border-b border-borderLight-light dark:border-borderLight-dark text-[11px]">
            {valueColumns.map((column) => (
              <Fragment key={`sub-${column.columnA.id}`}>
                <th className="px-2 py-1 text-left font-semibold min-w-[120px]">
                  <div className="flex items-center gap-2 text-textPrimary-light dark:text-textPrimary-dark">
                    <NamedIcon iconType={getColumnIcon(column.columnA)} size={12} />
                    <span>A</span>
                    <Group gap={2} align="center">
                      <SortButton
                        activeOrder={getSortOrder(sort, column.columnA.name)}
                        onClick={() => onSort(column.columnA.name)}
                      />
                      <ColumnFilterButton
                        columnId={column.columnA.id}
                        value={columnFilters[column.columnA.id] ?? ''}
                        onChange={onFilterChange}
                        label={`${column.displayName} (A)`}
                      />
                    </Group>
                  </div>
                </th>
                <th className="px-2 py-1 text-left font-semibold min-w-[120px]">
                  <div className="flex items-center gap-2 text-textPrimary-light dark:text-textPrimary-dark">
                    <NamedIcon iconType={getColumnIcon(column.columnB)} size={12} />
                    <span>B</span>
                    <Group gap={2} align="center">
                      <SortButton
                        activeOrder={getSortOrder(sort, column.columnB.name)}
                        onClick={() => onSort(column.columnB.name)}
                      />
                      <ColumnFilterButton
                        columnId={column.columnB.id}
                        value={columnFilters[column.columnB.id] ?? ''}
                        onChange={onFilterChange}
                        label={`${column.displayName} (B)`}
                      />
                    </Group>
                  </div>
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="text-sm">
          {rows.map((row, rowIndex) => {
            const statusRaw = rowStatusColumn
              ? (row[rowStatusColumn.id] as string | undefined)
              : undefined;
            const status = statusRaw && isComparisonRowStatus(statusRaw) ? statusRaw : 'same';
            const accentColor =
              status === 'same'
                ? undefined
                : getStatusAccentColor(theme, status, colorScheme, colorScheme === 'dark' ? 3 : 5);
            const surfaceColor =
              status === 'same'
                ? undefined
                : getStatusSurfaceColor(
                    theme,
                    status,
                    colorScheme,
                    colorScheme === 'dark' ? 0.24 : 0.14,
                  );

            return (
              <tr
                key={`${rowIndex}-${status}`}
                className={cn(
                  'border-b border-borderLight-light dark:border-borderLight-dark last:border-b-0',
                )}
                style={{
                  boxShadow: accentColor ? `inset 3px 0 0 0 ${accentColor}` : undefined,
                  backgroundColor: surfaceColor ?? undefined,
                }}
              >
                <td className="px-3 py-2 text-xs font-semibold text-textSecondary-light dark:text-textSecondary-dark">
                  {rowIndex + 1}
                </td>
                {rowStatusColumn ? (
                  <td className="px-3 py-2 align-top min-w-[140px]">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: getStatusSurfaceColor(
                          theme,
                          status,
                          colorScheme,
                          colorScheme === 'dark' ? 0.35 : 0.18,
                          colorScheme === 'dark' ? 0.45 : 0.22,
                        ),
                        color: getStatusAccentColor(
                          theme,
                          status,
                          colorScheme,
                          colorScheme === 'dark' ? 3 : 6,
                        ),
                      }}
                    >
                      {statusOrderLabel[status] ?? status}
                    </span>
                  </td>
                ) : null}
                {joinColumns.map(({ column }) => (
                  <td key={column.id} className="px-3 py-2 align-top min-w-[180px]">
                    {renderValue(row[column.id], column)}
                  </td>
                ))}
                {valueColumns.map((column) => {
                  const cellStatus = row[column.statusColumn.id] as string | undefined;
                  const highlightA =
                    cellStatus === 'modified' || cellStatus === 'removed'
                      ? getStatusSurfaceColor(
                          theme,
                          cellStatus === 'modified' ? 'modified' : 'removed',
                          colorScheme,
                          0.22,
                          0.28,
                        )
                      : undefined;
                  const highlightB =
                    cellStatus === 'modified' || cellStatus === 'added'
                      ? getStatusSurfaceColor(
                          theme,
                          cellStatus === 'modified' ? 'modified' : 'added',
                          colorScheme,
                          0.22,
                          0.28,
                        )
                      : undefined;
                  return (
                    <Fragment key={`${column.displayName}-${rowIndex}`}>
                      <td
                        className="px-3 py-2 align-top border-r border-transparent008-light min-w-[130px]"
                        style={{ backgroundColor: highlightA }}
                      >
                        {renderValue(row[column.columnA.id], column.columnA)}
                      </td>
                      <td
                        className="px-3 py-2 align-top min-w-[130px]"
                        style={{ backgroundColor: highlightB }}
                      >
                        {renderValue(row[column.columnB.id], column.columnB)}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
