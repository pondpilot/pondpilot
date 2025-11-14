import { MantineTheme, rgba as mantineRgba } from '@mantine/core';

export type ComparisonRowStatus = 'added' | 'removed' | 'modified' | 'same';

type ThemeColorKey = keyof MantineTheme['colors'];

interface StatusThemeConfig {
  label: string;
  textColor: ThemeColorKey;
  iconColor: ThemeColorKey;
  surfaceColor: ThemeColorKey;
  accentColorKey: ThemeColorKey;
}

export const COMPARISON_STATUS_THEME: Record<ComparisonRowStatus, StatusThemeConfig> = {
  added: {
    label: 'Added',
    textColor: 'text-success',
    iconColor: 'icon-success',
    surfaceColor: 'background-success',
    accentColorKey: 'green-600',
  },
  removed: {
    label: 'Removed',
    textColor: 'text-error',
    iconColor: 'icon-error',
    surfaceColor: 'background-error',
    accentColorKey: 'magenta-600',
  },
  modified: {
    label: 'Modified',
    textColor: 'text-warning',
    iconColor: 'icon-warning',
    surfaceColor: 'background-warning',
    accentColorKey: 'orange-600',
  },
  same: {
    label: 'Unchanged',
    textColor: 'text-tertiary',
    iconColor: 'icon-default',
    surfaceColor: 'background-secondary',
    accentColorKey: 'grey-600',
  },
};

export const isComparisonRowStatus = (value: string): value is ComparisonRowStatus =>
  (['added', 'removed', 'modified', 'same'] as readonly string[]).includes(value);

export const getThemeColorValue = (
  theme: MantineTheme,
  color: ThemeColorKey,
  shade: number = 5,
) => {
  const palette = theme.colors[color];
  if (!palette || palette.length === 0) {
    return undefined;
  }
  const index = Math.min(Math.max(shade, 0), palette.length - 1);
  return palette[index];
};

export const getStatusAccentColor = (
  theme: MantineTheme,
  status: ComparisonRowStatus,
  colorScheme: 'light' | 'dark' = 'light',
  shade?: number,
) => {
  const { accentColorKey } = COMPARISON_STATUS_THEME[status];

  // Prefer slightly darker shade in dark mode for contrast
  const fallbackShade = shade !== undefined ? shade : colorScheme === 'dark' ? 4 : 6;

  return getThemeColorValue(theme, accentColorKey, fallbackShade);
};

export const getStatusSurfaceColor = (
  theme: MantineTheme,
  status: ComparisonRowStatus,
  colorScheme: 'light' | 'dark' = 'light',
  lightOpacity: number = 0.16,
  darkOpacity: number = 0.32,
) => {
  const accent = getStatusAccentColor(theme, status, colorScheme);
  if (!accent) {
    return undefined;
  }

  const alpha = colorScheme === 'dark' ? darkOpacity : lightOpacity;
  return mantineRgba(accent, alpha);
};
