/**
 * Chart type definitions for the chart view feature.
 */

export type ChartType =
  | 'bar'
  | 'line'
  | 'scatter'
  | 'pie'
  | 'area'
  | 'stacked-bar'
  | 'horizontal-bar';

export type AggregationType = 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max';

export type SortOrder = 'none' | 'asc' | 'desc';

/** Available color scheme presets for charts */
export type ColorScheme = 'default' | 'blue' | 'green' | 'orange' | 'purple' | 'monochrome';

export type ChartConfig = {
  chartType: ChartType;
  xAxisColumn: string | null;
  yAxisColumn: string | null;
  groupByColumn: string | null;
  aggregation: AggregationType;
  sortBy: 'x' | 'y';
  sortOrder: SortOrder;
  /** Custom chart title (optional) */
  title: string | null;
  /** Custom X-axis label (optional, defaults to column name) */
  xAxisLabel: string | null;
  /** Custom Y-axis label (optional, defaults to column name) */
  yAxisLabel: string | null;
  /** Color scheme preset for chart colors */
  colorScheme: ColorScheme;
  /**
   * Additional Y columns for small multiples view.
   * When set, renders multiple charts stacked vertically with synced X-axis.
   */
  additionalYColumns: string[];
};

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  chartType: 'bar',
  xAxisColumn: null,
  yAxisColumn: null,
  groupByColumn: null,
  aggregation: 'sum',
  sortBy: 'x',
  sortOrder: 'none',
  title: null,
  xAxisLabel: null,
  yAxisLabel: null,
  colorScheme: 'default',
  additionalYColumns: [],
};

export const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  default: 'Default',
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  purple: 'Purple',
  monochrome: 'Monochrome',
};

export const AGGREGATION_LABELS: Record<AggregationType, string> = {
  none: 'None',
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  min: 'Min',
  max: 'Max',
};

export const SORT_ORDER_LABELS: Record<SortOrder, string> = {
  none: 'Default',
  asc: 'Ascending',
  desc: 'Descending',
};

export type ViewMode = 'table' | 'chart' | 'metadata';

export const DEFAULT_VIEW_MODE: ViewMode = 'table';
