import { useMantineTheme } from '@mantine/core';
import { useMemo } from 'react';

const resolveCssColor = (value: string) => {
  if (value.startsWith('var(') && typeof window !== 'undefined') {
    const varName = value.slice(4, -1).trim();
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (resolved) {
      return resolved;
    }
  }

  return value;
};

const rgbToHex = (value: string) => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (!match) return undefined;

  const [, r, g, b, a] = match;
  if (a !== undefined && Number(a) === 0) {
    return undefined;
  }

  const toHex = (channel: string) => Number(channel).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const hexToHex = (value: string) => {
  const normalized = value.trim();
  if (!normalized.startsWith('#')) {
    return undefined;
  }

  if (normalized.length === 7) {
    return normalized;
  }

  if (normalized.length === 9) {
    const alpha = normalized.slice(7);
    if (alpha === '00') {
      return undefined;
    }
    return normalized.slice(0, 7);
  }

  return undefined;
};

const toHexColor = (value: string) => {
  const resolved = resolveCssColor(value).trim();
  if (!resolved) {
    return undefined;
  }

  if (resolved.toLowerCase() === 'transparent') {
    return undefined;
  }

  const hex = hexToHex(resolved);
  if (hex) {
    return hex;
  }

  return rgbToHex(resolved);
};

const normalizeTokenColor = (value: string) => {
  const hex = toHexColor(value);
  if (!hex) {
    return undefined;
  }

  return hex.slice(1);
};

const normalizeThemeColor = (value: string, fallback: string) => {
  return toHexColor(value) ?? fallback;
};

const buildTokenRule = (token: string, color: string) => {
  const foreground = normalizeTokenColor(color);
  if (!foreground) {
    return null;
  }

  return { token, foreground };
};

export const useEditorTheme = (colorSchemeDark: boolean) => {
  const { colors } = useMantineTheme();

  return useMemo(() => {
    const themeName = colorSchemeDark ? 'pondpilot-dark' : 'pondpilot-light';
    const themeData = {
      base: colorSchemeDark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: [
        buildTokenRule('comment', colors['text-secondary'][0]),
        buildTokenRule('string', colors['icon-error'][0]),
        buildTokenRule('keyword', colors['text-accent'][0]),
        buildTokenRule('number', colors['icon-success'][0]),
      ].filter(Boolean),
      colors: {
        'editor.background': normalizeThemeColor(
          colorSchemeDark ? colors['brandBlue_neon-50'][0] : colors['grey-50'][0],
          colorSchemeDark ? '#111111' : '#fdfdfd',
        ),
        'editor.foreground': normalizeThemeColor(
          colors['text-primary'][0],
          colorSchemeDark ? '#fdfdfd' : '#212328',
        ),
        'editorCursor.foreground': normalizeThemeColor(
          colors['text-accent'][0],
          colorSchemeDark ? '#4c61ff' : '#4957c1',
        ),
        'editor.selectionBackground': normalizeThemeColor(
          colorSchemeDark ? colors['brandBlue_neon-200'][0] : colors['brand-blue-100'][0],
          colorSchemeDark ? '#1b255a' : '#e5e7f6',
        ),
        'editor.lineHighlightBackground': colorSchemeDark ? '#2c313c' : '#efefef',
        'editorLineNumber.foreground': normalizeThemeColor(
          colors['text-secondary'][0],
          colorSchemeDark ? '#a8b3c4' : '#6f7785',
        ),
        'editorLineNumber.activeForeground': normalizeThemeColor(
          colors['text-primary'][0],
          colorSchemeDark ? '#fdfdfd' : '#212328',
        ),
      },
    };

    return {
      themeName,
      themeData,
    };
  }, [colorSchemeDark, colors]);
};
