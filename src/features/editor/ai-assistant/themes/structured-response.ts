import { EditorView } from '@codemirror/view';

// Structured response widget theme
export const structuredResponseTheme = EditorView.baseTheme({
  '.cm-structured-response-widget': {
    display: 'block',
    width: '100%',
    margin: '0', // Remove vertical margin to prevent downward shift
    padding: '0',
    outline: 'none',

    '&:focus': {
      outline: 'none',
    },
  },

  '.structured-response-container': {
    width: '100%',
    maxWidth: '600px',
    minWidth: '400px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    fontSize: '14px',
    boxSizing: 'border-box',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#2d2d2d',
      borderColor: '#404040',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.4)',
    },
  },

  '.structured-response-header': {
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f8fafc',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1e1e1e',
      borderBottomColor: '#404040',
    },
  },

  '.structured-response-title': {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#e5e7eb',
    },
  },

  '.structured-response-summary': {
    margin: '0',
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.5',
    wordWrap: 'break-word',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    hyphens: 'auto',
    whiteSpace: 'normal',
    maxWidth: '100%',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
    },
  },

  '.structured-response-section-title': {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#e5e7eb',
    },
  },

  '.structured-response-actions': {
    padding: '16px',
  },

  '.action-card': {
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '12px',
    backgroundColor: '#ffffff',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'visible',
    minWidth: '0',

    '&.recommended': {
      borderColor: '#3b82f6',
      backgroundColor: '#eff6ff',
    },

    '&:last-child': {
      marginBottom: '0',
    },

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#374151',
      borderColor: '#4b5563',
    },

    '[data-mantine-color-scheme="dark"] &.recommended': {
      backgroundColor: '#1e3a8a',
      borderColor: '#3b82f6',
    },
  },

  '.action-description': {
    fontSize: '14px',
    color: '#374151',
    marginBottom: '8px',
    fontWeight: '500',
    lineHeight: '1.5',
    wordWrap: 'break-word',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    hyphens: 'auto',
    whiteSpace: 'normal',
    maxWidth: '100%',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#e5e7eb',
    },
  },

  '.action-code-preview': {
    fontSize: '12px',
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
    backgroundColor: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    padding: '8px',
    margin: '8px 0',
    overflow: 'auto',
    maxHeight: '120px',
    width: '100%',
    color: '#374151',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    boxSizing: 'border-box',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1f2937',
      borderColor: '#4b5563',
      color: '#e5e7eb',
    },
  },

  '.action-confidence': {
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '8px',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
    },
  },

  '.action-buttons': {
    display: 'flex',
    gap: '8px',
  },

  '.action-apply-btn': {
    backgroundColor: '#4957C1', // backgroundAccent-light
    color: '#FFFFFF', // textContrast-light
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s',

    '&:hover': {
      opacity: '0.9',
    },

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#4C61FF', // backgroundAccent-dark
      color: '#FDFDFD', // textContrast-dark
    },
  },

  '.action-copy-btn': {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',

    '&:hover': {
      backgroundColor: '#f3f4f6',
      color: '#374151',
    },

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
      borderColor: '#4b5563',
    },

    '[data-mantine-color-scheme="dark"] &:hover': {
      backgroundColor: '#4b5563',
      color: '#e5e7eb',
    },
  },

  '.structured-response-alternatives': {
    padding: '16px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1f2937',
      borderTopColor: '#404040',
    },
  },

  '.alternative-card': {
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '12px',
    backgroundColor: '#ffffff',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'visible',
    minWidth: '0',

    '&:last-child': {
      marginBottom: '0',
    },

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#374151',
      borderColor: '#4b5563',
    },
  },

  '.alternative-title': {
    margin: '0 0 6px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#e5e7eb',
    },
  },

  '.alternative-description': {
    margin: '0 0 8px 0',
    fontSize: '13px',
    color: '#6b7280',
    lineHeight: '1.4',
    wordWrap: 'break-word',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    hyphens: 'auto',
    whiteSpace: 'normal',
    maxWidth: '100%',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
    },
  },

  '.alternative-code-preview': {
    fontSize: '12px',
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
    backgroundColor: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    padding: '8px',
    margin: '8px 0',
    overflow: 'auto',
    maxHeight: '100px',
    color: '#374151',
    whiteSpace: 'pre-wrap',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1f2937',
      borderColor: '#4b5563',
      color: '#e5e7eb',
    },
  },

  '.alternative-buttons': {
    display: 'flex',
    gap: '8px',
  },

  '.alternative-use-btn': {
    backgroundColor: '#4957C1', // backgroundAccent-light
    color: '#FFFFFF', // textContrast-light
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s',

    '&:hover': {
      opacity: '0.9',
    },

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#4C61FF', // backgroundAccent-dark
      color: '#FDFDFD', // textContrast-dark
    },
  },

  '.alternative-copy-btn': {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',

    '&:hover': {
      backgroundColor: '#f3f4f6',
      color: '#374151',
    },

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
      borderColor: '#4b5563',
    },

    '[data-mantine-color-scheme="dark"] &:hover': {
      backgroundColor: '#4b5563',
      color: '#e5e7eb',
    },
  },

  '.structured-response-footer': {
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#1f2937',
      borderTopColor: '#404040',
    },
  },

  '.structured-response-hints': {
    fontSize: '11px',
    color: '#9ca3af',
    fontWeight: '500',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#6b7280',
    },
  },

  '.structured-response-spacer': {
    flex: '1',
  },

  '.structured-response-close': {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',

    '&:hover': {
      backgroundColor: '#f3f4f6',
      color: '#374151',
    },

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',
      borderColor: '#4b5563',
    },

    '[data-mantine-color-scheme="dark"] &:hover': {
      backgroundColor: '#4b5563',
      color: '#e5e7eb',
    },
  },
});
