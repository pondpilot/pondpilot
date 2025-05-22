import { useCallback } from 'react';

import {
  MAX_FREQUENCY_DISTINCT_VALUES,
  MAX_STRING_LENGTH,
  HISTOGRAM_BIN_COUNT,
} from '../constants';
import { DataRowArray } from '../model';
import {
  isNumericColumnType,
  parseNumericValue,
  isDateColumnType,
  parseDateValue,
} from '../utils/column-types';

/**
 * Hook that provides statistical calculation functions for metadata stats
 *
 * This hook encapsulates all statistical computation logic to maintain separation
 * of concerns and enable easier testing and reuse across different components.
 *
 * Performance considerations:
 * - Uses Sets for efficient distinct value counting
 * - Processes data in single passes where possible
 * - Handles edge cases gracefully (empty arrays, invalid values)
 * - Uses memoized callbacks to prevent unnecessary re-calculations
 */
export function useStatsCalculations() {
  /**
   * Calculates fundamental statistics for any column type
   *
   * Algorithm:
   * 1. Single pass through all rows for efficiency
   * 2. Uses Set for O(1) distinct value tracking
   * 3. Simultaneously collects numeric values for numeric columns
   * 4. Handles null/undefined values consistently
   *
   * Time complexity: O(n) where n is the number of rows
   * Space complexity: O(d) where d is the number of distinct values
   *
   * @param rows - Array of data rows to analyze
   * @param columnId - The column identifier to analyze
   * @param columnType - SQL type of the column for type-specific processing
   * @returns Object containing distinctCount, nonNullCount, and numericValues (if applicable)
   */
  const calculateBasicStats = useCallback(
    (rows: DataRowArray, columnId: string, columnType: string) => {
      const distinctValues = new Set();
      let nonNullCount = 0;
      const numericValues: number[] = [];

      // Single pass through data for efficiency
      for (const row of rows) {
        const value = row[columnId];
        if (value !== null && value !== undefined) {
          nonNullCount += 1;
          distinctValues.add(value);

          // For numeric columns, also collect parsed numeric values for statistics
          // This enables downstream calculations without re-parsing
          if (isNumericColumnType(columnType)) {
            const numValue = parseNumericValue(value);
            if (numValue !== null) {
              numericValues.push(numValue);
            }
          } else if (isDateColumnType(columnType)) {
            const dateValue = parseDateValue(value);
            if (dateValue !== null) {
              numericValues.push(dateValue);
            }
          }
        }
      }

      return {
        distinctCount: distinctValues.size,
        nonNullCount,
        numericValues:
          isNumericColumnType(columnType) || isDateColumnType(columnType) ? numericValues : null,
      };
    },
    [],
  );

  /**
   * Calculates frequency distribution for categorical data visualization
   *
   * Algorithm:
   * 1. Count occurrences of each unique value using a hash map
   * 2. Sort by frequency in descending order
   * 3. Return top N values to limit memory usage and improve UI performance
   * 4. Filter out excessively long string values to prevent UI issues
   *
   * Performance optimizations:
   * - Early exit for empty datasets
   * - String length limiting to prevent memory bloat
   * - Top-K selection to bound output size
   * - Graceful error handling for non-stringifiable values
   *
   * Time complexity: O(n + k log k) where n = rows, k = distinct values
   * Space complexity: O(min(k, maxDistinctValues))
   *
   * @param rows - Array of data rows to analyze
   * @param columnId - The column identifier to analyze
   * @param maxDistinctValues - Maximum number of distinct values to return (prevents memory issues)
   * @returns Object mapping values to their frequencies, sorted by frequency descending
   */
  const calculateFrequencyDistribution = useCallback(
    (rows: DataRowArray, columnId: string, maxDistinctValues = MAX_FREQUENCY_DISTINCT_VALUES) => {
      if (rows.length === 0) return {};

      const valueMap: Record<string, number> = {};

      // Single pass to count frequencies
      for (const row of rows) {
        const value = row[columnId];
        if (value !== null && value !== undefined) {
          try {
            const strValue = String(value);
            // Prevent memory bloat from extremely long string values
            if (strValue.length <= MAX_STRING_LENGTH) {
              valueMap[strValue] = (valueMap[strValue] || 0) + 1;
            }
          } catch (e) {
            // Skip values that can't be converted to string (rare edge case)
            continue;
          }
        }
      }

      // Sort by frequency (descending) and limit to top N for performance
      const sortedEntries = Object.entries(valueMap)
        .sort((a, b) => b[1] - a[1]) // Sort by frequency, highest first
        .slice(0, maxDistinctValues); // Limit to prevent UI performance issues

      return Object.fromEntries(sortedEntries);
    },
    [],
  );

  /**
   * Creates histogram bins for numeric data visualization
   *
   * Algorithm:
   * 1. Sort values to find min/max (O(n log n))
   * 2. Handle degenerate case where all values are identical
   * 3. Create uniform-width bins across the data range
   * 4. Assign each value to appropriate bin using floor division
   * 5. Handle edge case where value equals max (assign to last bin)
   *
   * Mathematical approach:
   * - Uses uniform bin width: (max - min) / binCount
   * - Bin assignment: floor((value - min) / binWidth)
   * - Edge case handling: values equal to max go in the last bin
   *
   * Time complexity: O(n log n + n) = O(n log n) due to sorting
   * Space complexity: O(binCount) for the output bins
   *
   * @param numericValues - Array of numeric values to bin
   * @param binCount - Number of histogram bins to create
   * @returns Array of bin objects with bin start value and frequency count
   */
  const calculateHistogram = useCallback(
    (numericValues: number[], binCount = HISTOGRAM_BIN_COUNT) => {
      if (numericValues.length === 0) return [];

      // Sort to find range efficiently
      const sortedValues = [...numericValues].sort((a, b) => a - b);
      const min = sortedValues[0];
      const max = sortedValues[sortedValues.length - 1];

      // Handle degenerate case: all values are identical
      if (min === max) {
        return [{ bin: min, frequency: numericValues.length }];
      }

      // Calculate uniform bin width
      const binWidth = (max - min) / binCount;
      const bins: { bin: number; frequency: number }[] = [];

      // Initialize bins with zero frequency
      for (let i = 0; i < binCount; i += 1) {
        const binStart = min + i * binWidth;
        bins.push({ bin: binStart, frequency: 0 });
      }

      // Assign each value to its appropriate bin
      for (const value of numericValues) {
        // Calculate bin index, ensuring values at max go to last bin
        const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
        if (binIndex >= 0 && binIndex < bins.length) {
          bins[binIndex].frequency += 1;
        }
      }

      return bins;
    },
    [],
  );

  /**
   * Calculates comprehensive descriptive statistics for numeric data
   *
   * Statistical measures computed:
   * - Min/Max: Range boundaries
   * - Mean: Arithmetic average (sensitive to outliers)
   * - Median: Middle value when sorted (robust to outliers)
   * - Standard Deviation: Measure of spread around the mean
   *
   * Algorithm details:
   * - Uses population standard deviation (divides by n, not n-1)
   * - Median calculation handles both even and odd array lengths
   * - Single sort operation used for min/max/median efficiency
   * - Two-pass algorithm: one for sorting, one for variance
   *
   * Mathematical formulas:
   * - Mean: μ = Σx / n
   * - Median: middle value (or average of two middle values)
   * - Variance: σ² = Σ(x - μ)² / n
   * - Standard deviation: σ = √(σ²)
   *
   * Time complexity: O(n log n) due to sorting
   * Space complexity: O(n) for the sorted copy
   *
   * @param numericValues - Array of numeric values to analyze
   * @returns Object containing min, max, mean, median, and stdDev
   */
  const calculateNumericStats = useCallback((numericValues: number[]) => {
    if (numericValues.length === 0) return {};

    // Sort once for min/max/median calculations
    const sortedValues = [...numericValues].sort((a, b) => a - b);
    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];

    // Calculate arithmetic mean
    const mean = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;

    // Calculate median (robust central tendency measure)
    const median =
      sortedValues.length % 2 === 0
        ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
        : sortedValues[Math.floor(sortedValues.length / 2)];

    // Calculate population standard deviation
    const variance =
      numericValues.reduce((sum, val) => sum + (val - mean) ** 2, 0) / numericValues.length;
    const stdDev = Math.sqrt(variance);

    return { min, max, mean, median, stdDev };
  }, []);

  return {
    calculateBasicStats,
    calculateFrequencyDistribution,
    calculateHistogram,
    calculateNumericStats,
  };
}
