import { EditorView } from '@codemirror/view';

export const mentionDropdownTheme = EditorView.theme({
  '.ai-widget-mention-dropdown': {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    maxHeight: '200px',
    overflowY: 'auto',
  },

  '.ai-widget-mention-item': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
    fontSize: '14px',
    color: 'var(--mantine-color-text)',

    '&:hover': {
      backgroundColor: '#f3f4f6',
    },

    '&.selected': {
      backgroundColor: '#dbeafe',
      color: '#1e40af',
    },
  },

  '.ai-widget-mention-icon': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    marginRight: '8px',
    color: '#6b7280',
  },

  '.ai-widget-mention-item.selected .ai-widget-mention-icon': {
    color: '#1e40af',
  },

  '.ai-widget-mention-label': {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
  },

  '.ai-widget-mention-label-text': {
    whiteSpace: 'nowrap',
  },

  '.ai-widget-mention-context': {
    color: '#9ca3af',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // Style for mentioned tables in the textarea
  '.ai-widget-textarea-container textarea': {
    '&::placeholder': {
      fontSize: '13px',
    },
  },

  // Dark theme adjustments
  '[data-mantine-color-scheme="dark"] .ai-widget-mention-dropdown': {
    background: '#1f2937',
    borderColor: '#374151',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-item': {
    color: '#e5e7eb',

    '&:hover': {
      backgroundColor: '#374151',
    },

    '&.selected': {
      backgroundColor: '#3b82f6',
      color: '#ffffff',
    },
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-icon': {
    color: '#9ca3af',
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-item.selected .ai-widget-mention-icon': {
    color: '#ffffff',
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-context': {
    color: '#6b7280',
  },

  // Error item styles
  '.ai-widget-mention-item.error': {
    cursor: 'default',
    opacity: '0.7',
  },

  '.ai-widget-mention-item.error .ai-widget-mention-icon': {
    color: '#dc2626',
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-item.error .ai-widget-mention-icon': {
    color: '#ef4444',
  },
});
