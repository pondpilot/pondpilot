// Chart theme constants for light and dark modes

export const CHART_THEME = {
  light: {
    background: 'transparent',
    text: {
      primary: '#333',
      secondary: '#666',
    },
    axis: {
      labelColor: '#333',
      titleColor: '#333',
      gridColor: '#ddd',
      domainColor: '#999',
      tickColor: '#999',
    },
    legend: {
      labelColor: '#333',
      titleColor: '#333',
    },
    mark: {
      // Default colors for data marks
      color: '#4682B4',
      opacity: 0.8,
    },
  },
  dark: {
    background: 'transparent',
    text: {
      primary: '#e1e1e1',
      secondary: '#b0b0b0',
    },
    axis: {
      labelColor: '#e1e1e1',
      titleColor: '#e1e1e1',
      gridColor: '#444',
      domainColor: '#666',
      tickColor: '#666',
    },
    legend: {
      labelColor: '#e1e1e1',
      titleColor: '#e1e1e1',
    },
    mark: {
      // Default colors for data marks
      color: '#7CB5EC',
      opacity: 0.8,
    },
  },
} as const;

export type ChartTheme = typeof CHART_THEME;
export type ColorScheme = keyof ChartTheme;

/**
 * Get theme configuration for Vega-Lite based on color scheme
 */
export function getChartThemeConfig(colorScheme: 'light' | 'dark') {
  const theme = CHART_THEME[colorScheme];

  return {
    background: theme.background,
    axis: theme.axis,
    legend: theme.legend,
    title: {
      color: theme.text.primary,
    },
    mark: theme.mark,
    view: {
      stroke: 'transparent',
    },
  };
}
