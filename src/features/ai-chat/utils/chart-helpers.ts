import { QueryResults } from '@models/ai-chat';

export interface ChartableDataAnalysis {
  isChartable: boolean;
  hasNumericData: boolean;
  hasTemporalData: boolean;
  hasCategoricalData: boolean;
  suggestedChartTypes: string[];
  numericColumns: string[];
  temporalColumns: string[];
  categoricalColumns: string[];
}

/**
 * Analyzes query results to determine if they are suitable for visualization
 */
export function analyzeChartableData(results: QueryResults): ChartableDataAnalysis {
  const analysis: ChartableDataAnalysis = {
    isChartable: false,
    hasNumericData: false,
    hasTemporalData: false,
    hasCategoricalData: false,
    suggestedChartTypes: [],
    numericColumns: [],
    temporalColumns: [],
    categoricalColumns: [],
  };

  // Need at least 2 columns and more than 1 row for meaningful visualization
  if (results.columns.length < 2 || results.rows.length <= 1) {
    return analysis;
  }

  // Analyze each column
  results.columns.forEach((column, colIndex) => {
    const columnLower = column.toLowerCase();
    const sampleValues = results.rows.slice(0, 10).map(row => row[colIndex]);
    
    // Check for temporal columns
    if (isTemporalColumn(columnLower, sampleValues)) {
      analysis.temporalColumns.push(column);
      analysis.hasTemporalData = true;
    }
    
    // Check for numeric columns
    else if (isNumericColumn(sampleValues)) {
      analysis.numericColumns.push(column);
      analysis.hasNumericData = true;
    }
    
    // Everything else is categorical
    else {
      analysis.categoricalColumns.push(column);
      analysis.hasCategoricalData = true;
    }
  });

  // Determine if data is chartable
  analysis.isChartable = analysis.hasNumericData || 
                        (analysis.hasTemporalData && results.columns.length >= 2);

  // Suggest chart types based on data
  if (analysis.isChartable) {
    analysis.suggestedChartTypes = suggestChartTypes(analysis, results);
  }

  return analysis;
}

/**
 * Checks if a column contains temporal data
 */
function isTemporalColumn(columnName: string, sampleValues: any[]): boolean {
  // Check column name for temporal indicators
  const temporalKeywords = ['date', 'time', 'year', 'month', 'day', 'hour', 'minute', 'timestamp', 'created', 'updated', 'modified'];
  const hasTemporalName = temporalKeywords.some(keyword => columnName.includes(keyword));
  
  if (hasTemporalName) {
    return true;
  }

  // Check sample values for date patterns
  return sampleValues.some(value => {
    if (value == null) return false;
    const str = String(value);
    // Simple date pattern checks
    return /^\d{4}-\d{2}-\d{2}/.test(str) || // ISO date
           /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(str) || // US date
           /^\d{4}$/.test(str) && Number(str) > 1900 && Number(str) < 2100; // Year
  });
}

/**
 * Checks if a column contains numeric data
 */
function isNumericColumn(sampleValues: any[]): boolean {
  const nonNullValues = sampleValues.filter(v => v != null);
  if (nonNullValues.length === 0) return false;
  
  // Check if at least 80% of non-null values are numbers
  const numericCount = nonNullValues.filter(v => typeof v === 'number').length;
  return numericCount / nonNullValues.length >= 0.8;
}

/**
 * Suggests appropriate chart types based on data analysis
 */
function suggestChartTypes(analysis: ChartableDataAnalysis, results: QueryResults): string[] {
  const suggestions: string[] = [];
  
  // Time series
  if (analysis.hasTemporalData && analysis.hasNumericData) {
    suggestions.push('line', 'area');
  }
  
  // Categorical comparisons
  if (analysis.hasCategoricalData && analysis.hasNumericData) {
    if (results.rows.length <= 20) {
      suggestions.push('bar', 'column');
    }
    if (analysis.numericColumns.length === 1 && analysis.categoricalColumns.length === 1) {
      suggestions.push('pie', 'donut');
    }
  }
  
  // Distributions
  if (analysis.numericColumns.length >= 1) {
    suggestions.push('histogram');
    if (analysis.numericColumns.length >= 2) {
      suggestions.push('scatter');
    }
  }
  
  // Heatmap for large categorical x categorical with numeric value
  if (analysis.categoricalColumns.length >= 2 && analysis.numericColumns.length >= 1 && results.rows.length > 10) {
    suggestions.push('heatmap');
  }
  
  return [...new Set(suggestions)]; // Remove duplicates
}

/**
 * Determines if user's query intent suggests they want a visualization
 */
export function userWantsVisualization(userMessage: string): boolean {
  const visualizationKeywords = [
    'chart', 'plot', 'graph', 'visualiz', 'show', 'display',
    'trend', 'distribution', 'compare', 'comparison',
    'over time', 'by month', 'by year', 'by day',
    'histogram', 'scatter', 'bar chart', 'line chart',
    'pie chart', 'heatmap'
  ];
  
  const messageLower = userMessage.toLowerCase();
  return visualizationKeywords.some(keyword => messageLower.includes(keyword));
}