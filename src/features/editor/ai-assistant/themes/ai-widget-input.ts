import { EditorView } from '@codemirror/view';

// AI widget input section theme
export const aiWidgetInputTheme = EditorView.baseTheme({
  '.ai-widget-input-section': {
    display: 'flex',
    alignItems: 'stretch',
  },

  '.ai-widget-textarea-container': {
    flex: '1',
    position: 'relative',
    minHeight: '32px',
  },

  '.ai-widget-textarea': {
    width: '100%',
    height: '32px',
    padding: '6px 8px',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontSize: '14px',
    lineHeight: '20px',
    backgroundColor: 'transparent',
    color: '#374151',
    fontFamily: 'inherit',

    '&::placeholder': {
      color: '#9ca3af',
    },

    '&:disabled': {
      opacity: '0.6',
      cursor: 'not-allowed',
    },

    '[data-mantine-color-scheme="dark"] &': {
      color: '#e5e7eb',
    },

    '[data-mantine-color-scheme="dark"] &::placeholder': {
      color: '#6b7280',
    },
  },

  '.ai-widget-generate': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    border: 'none',
    borderRadius: '16px',
    backgroundColor: '#4957C1', // backgroundAccent-light
    color: '#FFFFFF', // textContrast-light
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    minWidth: '70px',
    justifyContent: 'center',
    flexShrink: '0',
    whiteSpace: 'nowrap',

    '&:hover': {
      opacity: '0.9',
    },

    '&:disabled': {
      opacity: '0.6',
      cursor: 'not-allowed',
    },

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#4C61FF', // backgroundAccent-dark
      color: '#FDFDFD', // textContrast-dark

      '&:hover': {
        opacity: '0.9',
      },
    },
  },

  '.ai-widget-loading-dots': {
    animation: 'ai-loading-dots 1.5s infinite',
  },

  '@keyframes ai-loading-dots': {
    '0%': { opacity: '0.3' },
    '33%': { opacity: '1' },
    '66%': { opacity: '0.3' },
    '100%': { opacity: '0.3' },
  },

  '.ai-widget-select': {
    padding: '2px 6px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    backgroundColor: '#f9fafb',
    color: '#374151',
    fontSize: '11px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.2s ease',
    minWidth: '90px',
    maxWidth: '160px',

    '&:hover': {
      backgroundColor: '#f3f4f6',
      borderColor: '#d1d5db',
    },

    '&:focus': {
      borderColor: '#4957C1',
      boxShadow: '0 0 0 2px rgba(73, 87, 193, 0.1)',
    },

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      color: '#e5e7eb',
    },

    '[data-mantine-color-scheme="dark"] &:hover': {
      backgroundColor: '#374151',
      borderColor: '#4b5563',
    },

    '[data-mantine-color-scheme="dark"] &:focus': {
      borderColor: '#4C61FF',
      boxShadow: '0 0 0 2px rgba(76, 97, 255, 0.1)',
    },

    '& optgroup': {
      fontWeight: '600',
      fontSize: '10px',
      color: '#6b7280',
      backgroundColor: '#f3f4f6',
      padding: '4px 6px',
      fontStyle: 'normal',

      '[data-mantine-color-scheme="dark"] &': {
        color: '#9ca3af',
        backgroundColor: '#1a1a1a',
      },
    },

    '& option': {
      padding: '4px 8px',
      fontSize: '11px',
      backgroundColor: '#ffffff',
      color: '#374151',

      '&:hover': {
        backgroundColor: '#E5E7F6',
      },

      '&:checked': {
        backgroundColor: '#4957C1',
        color: '#ffffff',
      },

      '[data-mantine-color-scheme="dark"] &': {
        backgroundColor: '#1f2937',
        color: '#e5e7eb',
      },

      '[data-mantine-color-scheme="dark"] &:hover': {
        backgroundColor: '#374151',
      },

      '[data-mantine-color-scheme="dark"] &:checked': {
        backgroundColor: '#4C61FF',
        color: '#ffffff',
      },
    },
  },

  '.ai-widget-model-section': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  '.ai-widget-select-button': {
    cursor: 'pointer !important',

    '&:hover': {
      backgroundColor: '#f3f4f6 !important',
      borderColor: '#3b82f6 !important',
    },

    '[data-mantine-color-scheme="dark"] &:hover': {
      backgroundColor: '#4b5563 !important',
      borderColor: '#60a5fa !important',
    },
  },
});
