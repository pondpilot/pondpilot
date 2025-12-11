import { ColorScheme } from '@models/chart';

/**
 * Chart theme configuration matching the app's design system.
 * Uses colors from src/theme/theme.ts to ensure visual consistency.
 */
export interface ChartThemeColors {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  titleText: string;
}

/**
 * Light mode chart theme colors derived from app theme.
 * Uses blue-grey and grey palette values from theme.ts
 */
export const CHART_THEME_LIGHT: ChartThemeColors = {
  grid: '#E5E9F2', // blue-grey-200
  axis: '#6F7785', // grey-700
  tooltipBg: '#FDFDFD', // grey-50
  tooltipBorder: '#DBDDE1', // grey-300
  tooltipText: '#212328', // grey-900
  titleText: '#212328', // grey-900
};

/**
 * Dark mode chart theme colors derived from app theme.
 * Uses blue-grey palette values from theme.ts
 */
export const CHART_THEME_DARK: ChartThemeColors = {
  grid: '#384252', // blue-grey-700
  axis: '#A8B3C4', // blue-grey-400
  tooltipBg: '#242B35', // blue-grey-800
  tooltipBorder: '#5B6B86', // blue-grey-600
  tooltipText: '#FDFDFD', // grey-50
  titleText: '#FDFDFD', // grey-50
};

/**
 * Get chart theme colors for the current color scheme.
 */
export function getChartTheme(isDark: boolean): ChartThemeColors {
  return isDark ? CHART_THEME_DARK : CHART_THEME_LIGHT;
}

/**
 * Chart color palettes aligned with the app's design system.
 * Each palette uses colors that complement the app's brand colors
 * and work well in both light and dark modes.
 */
export const COLOR_PALETTES: Record<ColorScheme, readonly string[]> = {
  // Default palette uses brand-aligned colors for a cohesive look
  default: [
    '#4957C1', // brand-blue-500 - Primary brand color
    '#4CAE4F', // green-700 - Success color
    '#F4A462', // orange-700 - Warning color
    '#EF486F', // magenta-700 - Error/accent color
    '#06b6d4', // Cyan for additional contrast
    '#8b5cf6', // Violet for variety
    '#f59e0b', // Amber
    '#84cc16', // Lime
    '#ec4899', // Pink
    '#6366f1', // Indigo
  ],

  // Blue palette using brand-blue variations
  blue: [
    '#4957C1', // brand-blue-500
    '#737ECF', // brand-blue-400
    '#26349E', // brand-blue-700
    '#98A0DC', // brand-blue-300
    '#4C61FF', // brandBlue_neon-500
    '#6681FF', // brandBlue_neon-700
    '#869FFF', // brandBlue_neon-800
    '#384BCC', // brandBlue_neon-400
    '#2C3B93', // brandBlue_neon-300
    '#CAD8FF', // brandBlue_neon-900
  ],

  // Green palette using app's green scale
  green: [
    '#4CAE4F', // green-700
    '#75C277', // green-600
    '#99D29B', // green-500
    '#B8E0BA', // green-400
    '#2B612C', // green-800
    '#D2EBD3', // green-300
    '#E6F4E6', // green-200
    '#163317', // green-900
    '#10b981', // Emerald for variety
    '#14b8a6', // Teal
  ],

  // Orange palette using app's orange scale
  orange: [
    '#F4A462', // orange-700
    '#F7B987', // orange-600
    '#F9CCA6', // orange-500
    '#FBDBC2', // orange-400
    '#A8520C', // orange-800
    '#FCE8D8', // orange-300
    '#4E2605', // orange-900
    '#f59e0b', // Amber
    '#fbbf24', // Amber light
    '#ef4444', // Red for accent
  ],

  // Purple palette using brand and magenta colors
  purple: [
    '#8b5cf6', // Violet-500
    '#EF486F', // magenta-700
    '#F37391', // magenta-600
    '#a78bfa', // Violet-400
    '#F698AE', // magenta-500
    '#990D2E', // magenta-800
    '#c4b5fd', // Violet-300
    '#6366f1', // Indigo-500
    '#F9B8C7', // magenta-400
    '#4a0616', // magenta-900
  ],

  // Monochrome using app's grey scale
  monochrome: [
    '#212328', // grey-900
    '#3E434B', // grey-800
    '#6F7785', // grey-700
    '#9096A3', // grey-600
    '#AEB2BB', // grey-500
    '#C7CAD0', // grey-400
    '#DBDDE1', // grey-300
    '#EBECEE', // grey-200
    '#F6F6F7', // grey-100
    '#FDFDFD', // grey-50
  ],
};

/**
 * Default color palette (for backwards compatibility).
 */
export const CHART_COLORS = COLOR_PALETTES.default;

/**
 * Get a color from the specified palette by index, cycling through if needed.
 */
export function getChartColor(index: number, scheme: ColorScheme = 'default'): string {
  const palette = COLOR_PALETTES[scheme];
  return palette[index % palette.length];
}

/**
 * Get colors for a specific number of series using the specified color scheme.
 */
export function getChartColorPalette(count: number, scheme: ColorScheme = 'default'): string[] {
  return Array.from({ length: count }, (_, i) => getChartColor(i, scheme));
}

/**
 * Legacy exports for backwards compatibility.
 * @deprecated Use getChartTheme() instead
 */
export const CHART_GRID_COLOR_LIGHT = CHART_THEME_LIGHT.grid;
export const CHART_GRID_COLOR_DARK = CHART_THEME_DARK.grid;
export const CHART_AXIS_COLOR_LIGHT = CHART_THEME_LIGHT.axis;
export const CHART_AXIS_COLOR_DARK = CHART_THEME_DARK.axis;
export const CHART_TOOLTIP_BG_LIGHT = CHART_THEME_LIGHT.tooltipBg;
export const CHART_TOOLTIP_BG_DARK = CHART_THEME_DARK.tooltipBg;
