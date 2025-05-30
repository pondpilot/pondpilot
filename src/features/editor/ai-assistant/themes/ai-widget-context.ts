import { EditorView } from '@codemirror/view';

// AI widget context section theme
export const aiWidgetContextTheme = EditorView.baseTheme({
  '.ai-widget-context': {
    padding: '8px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e5e7eb',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1e1e1e',
      borderBottomColor: '#404040',
    },
  },

  '.ai-widget-context-label': {
    fontSize: '11px',
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
    },
  },

  '.ai-widget-context-code': {
    display: 'block',
    fontSize: '12px',
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
    color: '#374151',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    padding: '6px 8px',
    maxHeight: '80px',
    overflow: 'auto',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#e5e7eb',
      backgroundColor: '#2d2d2d',
      borderColor: '#404040',
    },
  },

  '.ai-widget-schema-context': {
    padding: '8px',
    backgroundColor: '#f1f5f9',
    borderBottom: '1px solid #e5e7eb',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1a1a1a',
      borderBottomColor: '#404040',
    },
  },

  '.ai-widget-schema-context-label': {
    fontSize: '11px',
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
    },
  },

  '.ai-widget-schema-indicator': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    lineHeight: '1.4',

    '&.available': {
      color: '#059669',
      '[data-mantine-color-scheme="dark"] &': {
        color: '#10b981',
      },
    },

    '&.not-available': {
      color: '#d97706',
      '[data-mantine-color-scheme="dark"] &': {
        color: '#f59e0b',
      },
    },

    '& span': {
      fontWeight: '500',
    },
  },

  '.ai-widget-combined-context': {
    borderBottom: '1px solid #e5e7eb',

    '[data-mantine-color-scheme="dark"] &': {
      borderBottomColor: '#404040',
    },
  },

  '.ai-widget-context-header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    userSelect: 'none',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#262626',
      borderBottomColor: '#404040',
    },
  },

  '.ai-widget-context-left': {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',

    '&:hover': {
      '& .ai-widget-context-header-label': {
        color: '#1f2937',
      },

      '[data-mantine-color-scheme="dark"] &': {
        '& .ai-widget-context-header-label': {
          color: '#f3f4f6',
        },
      },
    },
  },

  '.ai-widget-context-toggle': {
    fontSize: '10px',
    color: '#6b7280',
    marginRight: '6px',
    transition: 'transform 0.2s ease',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
    },
  },

  '.ai-widget-context-header-label': {
    fontSize: '11px',
    fontWeight: '500',
    color: '#374151',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#e5e7eb',
    },
  },

  '.ai-widget-context-content': {
    backgroundColor: '#ffffff',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1f1f1f',
    },
  },

  '.ai-widget-context-subsection': {
    padding: '8px',
    borderBottom: '1px solid #f3f4f6',

    '&:last-child': {
      borderBottom: 'none',
    },

    '[data-mantine-color-scheme="dark"] &': {
      borderBottomColor: '#2a2a2a',
    },
  },

  '.ai-widget-context-sublabel': {
    fontSize: '10px',
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
    },
  },
});
