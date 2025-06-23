import { EditorView } from '@codemirror/view';

// Base AI widget theme - container and common elements
export const aiWidgetBaseTheme = EditorView.baseTheme({
  // Prevent horizontal scrollbar when AI assistant is present
  '&.cm-editor .cm-scroller': {
    overflowX: 'hidden !important',
  },

  // Reset line styles when AI widget is present
  '.cm-activeLine.cm-line': {
    '& .cm-ai-assistant-widget': {
      verticalAlign: 'top !important',
    },
  },

  '.cm-ai-assistant-widget': {
    display: 'block',
    width: '100%',
    margin: '0',
    padding: '0', // Remove all padding
    position: 'relative',
    boxSizing: 'border-box', // Ensure padding is included in width
    textAlign: 'left !important', // Force left alignment
    backgroundColor: 'transparent',

    '& > *': {
      marginLeft: '0 !important', // Ensure all children are left aligned
      marginRight: 'auto !important',
    },
  },

  '.ai-widget-container': {
    maxWidth: '500px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    fontSize: '14px',
    margin: '0', // Remove vertical margin to prevent downward shift
    marginLeft: '0 !important', // Force left alignment
    marginRight: 'auto !important', // Push to the left

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
    flexWrap: 'wrap',
    minHeight: 'auto',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#262626',
      borderTopColor: '#404040',
    },
  },

  '.ai-widget-spacer': {
    flex: '1 1 auto',
    minWidth: '0',
  },

  '.ai-widget-hint': {
    fontSize: '11px',
    color: '#9ca3af',
    marginLeft: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: '1 1 auto',
    minWidth: '0',

    '[data-mantine-color-scheme="dark"] &': {
      color: '#6b7280',
    },
  },
});
