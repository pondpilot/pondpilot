import { useAppTheme } from '@hooks/use-app-theme';
import { useMemo } from 'react';

import { ChartThemeColors, getChartTheme } from '../utils/chart-colors';

/**
 * Hook that provides theme-aware colors for chart components.
 * Automatically switches between light and dark mode colors based on
 * the app's current color scheme.
 *
 * @returns ChartThemeColors object with all necessary chart styling colors
 *
 * @example
 * ```tsx
 * const { grid, axis, tooltipBg, tooltipBorder, tooltipText, titleText } = useChartTheme();
 *
 * <CartesianGrid stroke={grid} />
 * <XAxis tick={{ fill: axis }} />
 * ```
 */
export function useChartTheme(): ChartThemeColors & { isDark: boolean } {
  const colorScheme = useAppTheme();
  const isDark = colorScheme === 'dark';

  return useMemo(
    () => ({
      ...getChartTheme(isDark),
      isDark,
    }),
    [isDark],
  );
}
