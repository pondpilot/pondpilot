import { EditorView } from '@codemirror/view';

// Base AI widget theme - container and common elements
export const aiWidgetBaseTheme = EditorView.baseTheme({
  '.cm-ai-assistant-widget': {
    display: 'block',
    width: '100%',
    margin: '8px 0 12px 0', // More margin for better separation
    padding: '0',
  },

  '.ai-widget-container': {
    maxWidth: '500px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    fontSize: '14px',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#2d2d2d',
      borderColor: '#404040',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
    },
  },

  '.ai-widget-close': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '32px',
    padding: '0',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',

    '&:hover': {
      backgroundColor: '#f3f4f6',
      color: '#374151',
    },

    '[data-mantine-color-scheme="dark"] &:hover': {
      backgroundColor: '#404040',
      color: '#e5e7eb',
    },
  },

  '.ai-widget-footer': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#262626',
      borderTopColor: '#404040',
    },
  },

  '.ai-widget-spacer': {
    flex: '1',
  },

  '.ai-widget-hint': {
    fontSize: '11px',
    color: '#9ca3af',
    marginLeft: '4px',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#6b7280',
    },
  },
});
