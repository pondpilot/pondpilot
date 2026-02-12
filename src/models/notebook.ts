import {
  ChartConfig,
  DEFAULT_CHART_CONFIG,
  DEFAULT_VIEW_MODE,
  ViewMode,
} from './chart';
import { DataTable, DBTableOrViewSchema } from './db';
import { NewId } from './new-id';

export type NotebookId = NewId<'NotebookId'>;

export type CellId = NewId<'CellId'>;

export type CellRef = NewId<'CellRef'>;

export type NotebookCellType = 'sql' | 'markdown';

export type NotebookCellOutput = {
  viewMode: ViewMode;
  chartConfig: ChartConfig;
};

export type NotebookCellOutputPatch = {
  viewMode?: ViewMode;
  chartConfig?: Partial<ChartConfig>;
};

export type NotebookCellExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export type NotebookCellResultSnapshot = {
  schema: DBTableOrViewSchema;
  data: DataTable;
  /**
   * True when the persisted rows are capped and do not represent all rows.
   */
  truncated: boolean;
  capturedAt: string;
};

export type NotebookCellExecution = {
  status: NotebookCellExecutionStatus;
  error: string | null;
  executionTime: number | null;
  lastQuery: string | null;
  executionCount: number | null;
  lastRunAt: string | null;
  snapshot: NotebookCellResultSnapshot | null;
};

export type NotebookCellExecutionPatch = {
  status?: NotebookCellExecutionStatus;
  error?: string | null;
  executionTime?: number | null;
  lastQuery?: string | null;
  executionCount?: number | null;
  lastRunAt?: string | null;
  snapshot?: NotebookCellResultSnapshot | null;
};

export type NotebookCell = {
  id: CellId;
  ref: CellRef;
  name: string | null;
  type: NotebookCellType;
  content: string;
  order: number;
  dependsOn?: CellId[];
  output?: NotebookCellOutput;
  execution?: NotebookCellExecution;
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

export const normalizeNotebookCellExecution = (
  execution?: NotebookCellExecutionPatch | null,
): NotebookCellExecution => ({
  status: execution?.status ?? 'idle',
  error: execution?.error ?? null,
  executionTime: execution?.executionTime ?? null,
  lastQuery: execution?.lastQuery ?? null,
  executionCount: execution?.executionCount ?? null,
  lastRunAt: execution?.lastRunAt ?? null,
  snapshot: execution?.snapshot ?? null,
});

const equalStringArray = (a: string[], b: string[]): boolean => (
  a.length === b.length && a.every((value, index) => value === b[index])
);

const equalSchema = (a: DBTableOrViewSchema, b: DBTableOrViewSchema): boolean => (
  a.length === b.length &&
  a.every((col, index) => {
    const other = b[index];
    return (
      col.name === other.name &&
      col.sqlType === other.sqlType &&
      col.nullable === other.nullable &&
      col.databaseType === other.databaseType &&
      col.id === other.id &&
      col.columnIndex === other.columnIndex
    );
  })
);

const equalDataTable = (a: DataTable, b: DataTable): boolean => {
  if (a.length !== b.length) return false;

  for (let rowIndex = 0; rowIndex < a.length; rowIndex += 1) {
    const rowA = a[rowIndex] as Record<string, unknown>;
    const rowB = b[rowIndex] as Record<string, unknown>;

    const keysA = Object.keys(rowA);
    const keysB = Object.keys(rowB);

    if (keysA.length !== keysB.length) return false;

    for (let keyIndex = 0; keyIndex < keysA.length; keyIndex += 1) {
      const key = keysA[keyIndex];
      if (!Object.prototype.hasOwnProperty.call(rowB, key)) return false;
      if (!Object.is(rowA[key], rowB[key])) return false;
    }
  }

  return true;
};

const equalSnapshot = (
  a: NotebookCellResultSnapshot | null,
  b: NotebookCellResultSnapshot | null,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    a.truncated === b.truncated &&
    a.capturedAt === b.capturedAt &&
    equalSchema(a.schema, b.schema) &&
    equalDataTable(a.data, b.data)
  );
};

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

export const isNotebookCellExecutionEqual = (
  a: NotebookCellExecution,
  b: NotebookCellExecution,
): boolean => (
  a.status === b.status &&
  a.error === b.error &&
  a.executionTime === b.executionTime &&
  a.lastQuery === b.lastQuery &&
  a.executionCount === b.executionCount &&
  a.lastRunAt === b.lastRunAt &&
  equalSnapshot(a.snapshot, b.snapshot)
);
