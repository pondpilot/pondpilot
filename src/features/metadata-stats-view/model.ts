// Define allowed types for data values
export type DataValue = string | number | boolean | null | undefined;

// Define strict interface for data rows
export interface DataRow {
  [columnName: string]: DataValue;
}

// Define array of data rows
export type DataRowArray = DataRow[];

export interface ColumnMetadata {
  name: string;
  type: string;
  nonNullCount: number;
  distinctCount: number;
  countDistribution?: number; // Percentage for frequency distribution display
  min?: DataValue;
  max?: DataValue;
  mean?: number;
  median?: number;
  stdDev?: number;
  histogram?: { bin: number; frequency: number }[];
  frequencyDistribution?: Record<string, number>;
  error?: string; // Error message if column processing failed
}

export interface TableMetadata {
  tableName: string;
  rowCount: number;
  sampleRowCount?: number; // When sampling is used for large datasets
  isFullDataset?: boolean; // Whether stats were calculated on full dataset
  columns: ColumnMetadata[];
}
