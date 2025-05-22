// Constants for metadata statistics feature

// Data sampling and processing
export const MAX_SAMPLE_ROWS = 10000; // Maximum rows to process for stats to prevent memory issues
export const COLUMN_BATCH_SIZE = 3; // Default number of columns to process in parallel
export const MAX_FREQUENCY_DISTINCT_VALUES = 50; // Max unique values to include in frequency distribution
export const MAX_STRING_LENGTH = 1000; // Maximum length for string values in frequency distribution

// Dynamic batch sizing
export const MIN_BATCH_SIZE = 1; // Minimum batch size for complex datasets
export const MAX_BATCH_SIZE = 10; // Maximum batch size for simple datasets
export const BATCH_SIZE_THRESHOLD_COLUMNS = 50; // Number of columns to trigger batch size reduction
export const BATCH_SIZE_THRESHOLD_ROWS = 5000; // Number of rows to trigger batch size reduction

// Chart and visualization
export const HISTOGRAM_BIN_COUNT = 10; // Number of bins for histogram
export const DEFAULT_CONTAINER_WIDTH = 300; // Default width for chart containers
export const DEFAULT_HISTOGRAM_HEIGHT = 150; // Default height for histograms
export const DEFAULT_FREQUENCY_HEIGHT = 100; // Default height for frequency distributions
export const COMPACT_CHART_HEIGHT = 30; // Height for charts in compact view
export const EXPANDED_CHART_WIDTH = 208; // Width for charts in expanded view
export const EXPANDED_CHART_HEIGHT = 100; // Height for charts in expanded view

// UI and display
export const DEFAULT_MAX_FREQUENCY_ITEMS = 10; // Default max items in frequency distribution
export const COMPACT_MAX_FREQUENCY_ITEMS = 3; // Max items in compact frequency view
export const MAX_LABEL_LENGTH = 13; // Maximum characters in truncated labels
export const EXPANDED_VIEW_HEIGHT_PERCENTAGE = 85; // Height percentage for expanded view
export const COLLAPSED_VIEW_HEIGHT_PERCENTAGE = 40; // Height percentage for collapsed view

// Numeric column types for type checking
export const NUMERIC_COLUMN_TYPES = [
  'INTEGER',
  'BIGINT',
  'DOUBLE',
  'REAL',
  'DECIMAL',
  'FLOAT',
] as const;

// Chart styling
export const CHART_PADDING = 10; // Padding around chart elements
export const HOVER_OPACITY = 100; // Opacity percentage on hover
export const DEFAULT_OPACITY = 70; // Default opacity percentage

// UI timing and interaction
export const DEFAULT_DEBOUNCE_MS = 200; // Default debounce delay for resize events
export const CHART_TRANSITION_DURATION = 200; // Duration for chart transitions in ms

// Chart rendering
export const MIN_BAR_WIDTH = 4; // Minimum width for histogram bars
export const MIN_BAR_HEIGHT = 0; // Minimum height for histogram bars
export const BAR_SPACING = 2; // Spacing between histogram bars
export const GRID_LINE_WIDTH = 1; // Width of grid lines in charts
export const GRID_OFFSET = 5; // Offset for grid lines from chart edge

// Calculation thresholds
export const MIN_WIDTH_FOR_CALCULATION = 1; // Minimum width before updating container measurements

// Numeric safety limits to prevent overflow and UI issues
export const MAX_SAFE_INTEGER_DISPLAY = Number.MAX_SAFE_INTEGER; // 2^53 - 1
export const MIN_SAFE_INTEGER_DISPLAY = Number.MIN_SAFE_INTEGER; // -(2^53 - 1)
export const MAX_SAFE_DECIMAL_PLACES = 6; // Maximum decimal places to display
export const MAX_CHART_VALUE = 1e12; // Maximum value allowed in charts to prevent rendering issues
export const MIN_CHART_VALUE = -1e12; // Minimum value allowed in charts

// Chart colors using theme-aware values - using main accent color for consistency
export const getChartColors = (isDark: boolean) =>
  ({
    histogram: isDark ? '#4C61FF' : '#4957C1', // backgroundAccent.dark/light - matches Run button
    frequency: isDark ? '#4C61FF' : '#4957C1', // backgroundAccent.dark/light - matches Run button
    boolean: {
      true: isDark ? '#4C61FF' : '#4957C1', // backgroundAccent.dark/light - matches Run button
      false: 'var(--mantine-color-magenta-500)',
    },
    distinct: isDark ? '#4C61FF' : '#4957C1', // backgroundAccent.dark/light - matches Run button
    gridLine: 'var(--mantine-color-border-primary)',
  }) as const;

// Fallback for components that can't use the hook
export const CHART_COLORS = {
  histogram: '#4957C1',
  frequency: '#4957C1',
  boolean: {
    true: '#4957C1',
    false: 'var(--mantine-color-magenta-500)',
  },
  distinct: '#4957C1',
  gridLine: 'var(--mantine-color-border-primary)',
} as const;
