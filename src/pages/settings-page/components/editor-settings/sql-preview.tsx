import { Box, Text, useMantineColorScheme } from '@mantine/core';
import { useMemo } from 'react';

interface SqlPreviewProps {
  fontSize: number;
  fontWeight?: 'light' | 'regular' | 'semibold' | 'bold';
}

interface SqlLine {
  lineNumber: number;
  tokens: Array<{ text: string; type: 'keyword' | 'table' | 'text' | 'function' }>;
}

export const SqlPreview = ({ fontSize, fontWeight = 'regular' }: SqlPreviewProps) => {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const sqlLines: SqlLine[] = useMemo(
    () => [
      {
        lineNumber: 1,
        tokens: [
          { text: 'SELECT', type: 'keyword' },
          { text: ' child_name,', type: 'text' },
          { text: 'COUNT', type: 'function' },
          { text: '(*)', type: 'text' },
        ],
      },
      {
        lineNumber: 2,
        tokens: [
          { text: 'FROM', type: 'keyword' },
          { text: ' nice_list', type: 'table' },
        ],
      },
      {
        lineNumber: 3,
        tokens: [
          { text: 'WHERE', type: 'keyword' },
          { text: ' blablabla', type: 'text' },
        ],
      },
      {
        lineNumber: 4,
        tokens: [
          { text: 'Or', type: 'text' },
          { text: ' type something', type: 'text' },
        ],
      },
    ],
    [],
  );

  const getTokenColor = (type: SqlLine['tokens'][0]['type']) => {
    switch (type) {
      case 'keyword':
      case 'function':
        return 'text-accent';
      case 'table':
        return isDark ? 'icon-error' : 'text-error';
      case 'text':
      default:
        return isDark ? 'text-primary' : 'text-primary';
    }
  };

  const getFontWeight = () => {
    switch (fontWeight) {
      case 'light':
        return 300;
      case 'regular':
        return 400;
      case 'semibold':
        return 600;
      case 'bold':
        return 700;
      default:
        return 400;
    }
  };

  return (
    <Box
      className="
        border rounded-[32px] overflow-hidden
        bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark
        border-borderPrimary-light dark:border-borderPrimary-dark
      "
      style={{
        width: '205px',
        height: '213px',
        boxShadow: isDark
          ? 'inset -16px 0px 9px rgba(56, 66, 82, 0.6)'
          : 'inset -16px 0px 9px rgba(242, 244, 248, 0.7)',
      }}
    >
      <Box
        className="flex flex-col items-start p-6 gap-2 h-full overflow-y-hidden overflow-x-visible"
        style={{ minWidth: 'max-content' }}
      >
        {sqlLines.map((line) => (
          <Box
            key={line.lineNumber}
            className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
          >
            <Text
              size="sm"
              c="text-secondary"
              className="text-right select-none"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: `${fontSize}rem`,
                lineHeight: `${fontSize * 1.41}rem`,
                fontWeight: getFontWeight(),
                minWidth: '2ch',
              }}
            >
              {line.lineNumber}
            </Text>
            <Box className="flex whitespace-nowrap">
              {line.tokens.map((token, index) => (
                <Text
                  key={index}
                  span
                  c={getTokenColor(token.type)}
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: `${fontSize}rem`,
                    lineHeight: `${fontSize * 1.41}rem`,
                    fontWeight: getFontWeight(),
                    whiteSpace: 'pre',
                  }}
                >
                  {token.text}
                </Text>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
