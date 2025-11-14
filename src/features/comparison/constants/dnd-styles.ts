import { MantineTheme, rgba } from '@mantine/core';

/**
 * Generates style object for drag-over state on drop targets
 *
 * @param theme - Mantine theme object
 * @param colorScheme - Current color scheme ('light' or 'dark')
 * @returns Style object to apply to drop target when dragging over
 */
export function getDragOverStyle(
  theme: MantineTheme,
  colorScheme: 'light' | 'dark',
): React.CSSProperties {
  return {
    borderStyle: 'dashed',
    borderColor: theme.colors.blue[colorScheme === 'dark' ? 4 : 6],
    backgroundColor:
      colorScheme === 'dark' ? rgba(theme.colors.blue[8], 0.2) : rgba(theme.colors.blue[2], 0.25),
  };
}
