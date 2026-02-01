import { Text } from '@mantine/core';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { forwardRef, useImperativeHandle, useRef } from 'react';

import { ColumnCard } from './column-card';

export interface ColumnDetailPanelProps {
  /** Dataset columns to display as cards */
  columns: DBColumn[];
  /** Column stats keyed by column name */
  columnStats: Map<string, ColumnStats>;
  /** Column distributions keyed by column name */
  columnDistributions: Map<string, ColumnDistribution>;
  /** Set of column names whose distributions are still loading */
  loadingDistributions: Set<string>;
  /** Per-column error messages, keyed by column name */
  errors?: Map<string, string>;
}

export interface ColumnDetailPanelHandle {
  /** Scrolls the panel so the card for the given column is visible */
  scrollToColumn: (columnName: string) => void;
}

/**
 * Detail panel showing horizontally scrollable cards, one per dataset column.
 * Each card displays distribution details: top values for text columns,
 * or bar histograms for numeric/date columns.
 */
export const ColumnDetailPanel = forwardRef<ColumnDetailPanelHandle, ColumnDetailPanelProps>(
  (
    { columns, columnStats, columnDistributions, loadingDistributions, errors },
    ref,
  ) => {
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const scrollRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToColumn(columnName: string) {
        const card = cardRefs.current.get(columnName);
        if (card && scrollRef.current) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      },
    }));

    if (columns.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <Text size="sm" c="text-tertiary">
            No columns to display
          </Text>
        </div>
      );
    }

    return (
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto h-full p-3 snap-x snap-mandatory"
      >
        {columns.map((column) => (
          <div
            key={column.name}
            ref={(el) => {
              if (el) {
                cardRefs.current.set(column.name, el);
              } else {
                cardRefs.current.delete(column.name);
              }
            }}
          >
            <ColumnCard
              column={column}
              stats={columnStats.get(column.name)}
              distribution={columnDistributions.get(column.name)}
              isDistributionLoading={loadingDistributions.has(column.name)}
              error={errors?.get(column.name)}
            />
          </div>
        ))}
      </div>
    );
  },
);

ColumnDetailPanel.displayName = 'ColumnDetailPanel';
