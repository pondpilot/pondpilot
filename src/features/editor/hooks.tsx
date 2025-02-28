import createTheme from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { useMemo } from 'react';
import { useMantineTheme } from '@mantine/core';

export const useEditorTheme = (colorSchemeDark: boolean) => {
  const { colors } = useMantineTheme();
  const lightTheme = createTheme({
    theme: 'light',
    settings: {
      background: 'transparent',
      foreground: colors['text-primary'][0],
      caret: colors['text-accent'][0],
      selection: colors['transparentBrandBlue-008'][0],
      selectionMatch: colors['transparentBrandBlue-008'][0],
      lineHighlight: '#EFEFEF',
      gutterBackground: 'transparent',
      gutterBorder: 'transparent',
    },
    styles: [
      { tag: t.comment, color: colors['text-tertiary'][0] },
      { tag: t.string, color: colors['text-error'][0] },
      { tag: t.keyword, color: colors['text-accent'][0] },
      { tag: t.number, color: colors['text-success'][0] },
    ],
  });

  const darkTheme = createTheme({
    theme: 'dark',
    settings: {
      foreground: colors['text-primary'][0],
      caret: colors['text-accent'][0],
      selection: colors['darkModeTransparentBrandBlue-008'][0],
      selectionMatch: colors['darkModeTransparentBrandBlue-008'][0],
      lineHighlight: '#2c313c',
      gutterBackground: 'transparent',
      gutterBorder: 'transparent',
    },
    styles: [
      { tag: t.comment, color: colors['text-secondary'][0] },
      { tag: t.string, color: colors['icon-error'][0] },
      { tag: t.keyword, color: colors['text-accent'][0] },
      { tag: t.number, color: colors['icon-success'][0] },
    ],
  });

  return useMemo(
    () => ({
      lightTheme,
      darkTheme,
    }),
    [colorSchemeDark],
  );
};
