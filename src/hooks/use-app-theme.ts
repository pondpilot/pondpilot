import { useComputedColorScheme } from '@mantine/core';

/**
 * Resolved app color scheme ('light' | 'dark').
 *
 * Uses Mantine's computed color scheme, which resolves the 'auto' setting to the
 * actual applied scheme in sync with `data-mantine-color-scheme`. `getInitialValueInEffect: false`
 * makes it read the real value on the first render (instead of defaulting to light and
 * correcting in an effect), so consumers like the Monaco editor get the correct theme at
 * mount and never flash/stick to the light theme while the app is dark.
 */
export const useAppTheme = () =>
  useComputedColorScheme('light', { getInitialValueInEffect: false });
