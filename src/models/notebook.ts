import {
  ChartConfig,
  DEFAULT_CHART_CONFIG,
  DEFAULT_VIEW_MODE,
  ViewMode,
} from './chart';
import { NewId } from './new-id';

export type NotebookId = NewId<'NotebookId'>;

export type CellId = NewId<'CellId'>;

export type NotebookCellType = 'sql' | 'markdown';

export type NotebookCellOutput = {
  viewMode: ViewMode;
  chartConfig: ChartConfig;
};

export type NotebookCellOutputPatch = {
  viewMode?: ViewMode;
  chartConfig?: Partial<ChartConfig>;
};

export type NotebookCell = {
  id: CellId;
  type: NotebookCellType;
  content: string;
  order: number;
  output?: NotebookCellOutput;
};

export type Notebook = {
  id: NotebookId;
  name: string;
  cells: NotebookCell[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Builds normalized output settings for a SQL cell.
 * Accepts partial/legacy values and fills missing fields with defaults.
 */
export const normalizeNotebookCellOutput = (
  output?: NotebookCellOutputPatch | null,
): NotebookCellOutput => {
  const rawChartConfig: Partial<ChartConfig> = output?.chartConfig ?? {};
  return {
    viewMode: output?.viewMode === 'chart' ? 'chart' : DEFAULT_VIEW_MODE,
    chartConfig: {
      ...DEFAULT_CHART_CONFIG,
      ...rawChartConfig,
      additionalYColumns: Array.isArray(rawChartConfig.additionalYColumns)
        ? rawChartConfig.additionalYColumns
        : [],
    },
  };
};

const equalStringArray = (a: string[], b: string[]): boolean => (
  a.length === b.length && a.every((value, index) => value === b[index])
);

/**
 * Deep equality for notebook SQL cell output settings.
 */
export const isNotebookCellOutputEqual = (
  a: NotebookCellOutput,
  b: NotebookCellOutput,
): boolean => (
  a.viewMode === b.viewMode &&
  a.chartConfig.chartType === b.chartConfig.chartType &&
  a.chartConfig.xAxisColumn === b.chartConfig.xAxisColumn &&
  a.chartConfig.yAxisColumn === b.chartConfig.yAxisColumn &&
  a.chartConfig.groupByColumn === b.chartConfig.groupByColumn &&
  a.chartConfig.aggregation === b.chartConfig.aggregation &&
  a.chartConfig.sortBy === b.chartConfig.sortBy &&
  a.chartConfig.sortOrder === b.chartConfig.sortOrder &&
  a.chartConfig.title === b.chartConfig.title &&
  a.chartConfig.xAxisLabel === b.chartConfig.xAxisLabel &&
  a.chartConfig.yAxisLabel === b.chartConfig.yAxisLabel &&
  a.chartConfig.colorScheme === b.chartConfig.colorScheme &&
  equalStringArray(a.chartConfig.additionalYColumns, b.chartConfig.additionalYColumns)
);
