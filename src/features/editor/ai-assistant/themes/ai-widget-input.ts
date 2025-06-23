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
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
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
    padding: '1px 3px',
    border: '1px solid #e5e7eb',
    borderRadius: '3px',
    backgroundColor: '#ffffff',
    color: '#6b7280',
    fontSize: '9px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    minWidth: '80px',
    maxWidth: '120px',

    '&:focus': {
      borderColor: '#3b82f6',
      boxShadow: '0 0 0 1px #3b82f6',
    },

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#374151',
      borderColor: '#4b5563',
      color: '#9ca3af',
    },

    '[data-mantine-color-scheme="dark"] &:focus': {
      borderColor: '#60a5fa',
      boxShadow: '0 0 0 1px #60a5fa',
    },

    '& optgroup': {
      fontWeight: '600',
      fontSize: '8px',
      color: '#374151',
      backgroundColor: '#f9fafb',
      padding: '1px 0',

      '[data-mantine-color-scheme="dark"] &': {
        color: '#e5e7eb',
        backgroundColor: '#2a2a2a',
      },
    },

    '& option': {
      padding: '1px 3px',
      fontSize: '9px',

      '&:checked': {
        backgroundColor: '#3b82f6',
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
