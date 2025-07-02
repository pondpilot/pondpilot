import { EditorView } from '@codemirror/view';

export const mentionDropdownTheme = EditorView.theme({
  '.ai-widget-mention-dropdown': {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    maxHeight: '200px',
    overflowY: 'auto',
    padding: '4px 0', // Add padding to give space for rounded items
  },

  '.ai-widget-mention-item': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    margin: '2px 8px', // Add margin for spacing between items
    borderRadius: '16px', // rounded-2xl equivalent
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
    fontSize: '14px',
    color: '#6F7785', // textSecondary-light

    '&:hover': {
      backgroundColor: '#2123280A', // transparentGray-004 (4% opacity) - matches Spotlight hover
    },

    '&.selected': {
      backgroundColor: '#E0E2F4', // Light purple selection color
      color: '#6F7785', // textSecondary-light
    },
  },

  '.ai-widget-mention-icon': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    marginRight: '8px',
    color: '#6F7785', // textSecondary-light
  },

  '.ai-widget-mention-item.selected .ai-widget-mention-icon': {
    color: '#6F7785', // textSecondary-light
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
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
    padding: '4px 0', // Add padding to give space for rounded items
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-item': {
    color: '#A8B3C4', // textSecondary-dark

    '&:hover': {
      backgroundColor: '#FFFFFF0A', // transparentWhite-004 (4% opacity) - matches Spotlight dark hover
    },

    '&.selected': {
      backgroundColor: '#29324C', // Dark purple selection color
      color: '#A8B3C4', // textSecondary-dark
    },
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-icon': {
    color: '#A8B3C4', // textSecondary-dark
  },

  '[data-mantine-color-scheme="dark"] .ai-widget-mention-item.selected .ai-widget-mention-icon': {
    color: '#A8B3C4', // textSecondary-dark
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
