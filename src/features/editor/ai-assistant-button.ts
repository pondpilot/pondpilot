import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

// State effect to toggle button visibility
export const toggleAIButtonEffect = StateEffect.define<boolean>();

// State field for button visibility
export const aiButtonStateField = StateField.define<{
  visible: boolean;
}>({
  create: () => ({ visible: true }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(toggleAIButtonEffect)) {
        return { visible: effect.value };
      }
    }
    return value;
  },
});

// ViewPlugin to handle button rendering
const aiButtonPlugin = ViewPlugin.fromClass(
  class {
    container: HTMLDivElement | null = null;

    constructor(private view: EditorView) {
      this.createButton();
    }

    createButton() {
      // Create button directly
      const button = document.createElement('button');
      button.className = 'ai-button';

      const platformKey = /Mac|iPhone|iPod|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
      button.title = `Open AI Assistant (${platformKey}+I)`;

      // Create the sparkles icon using SVG
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
          <path d="M20 3v4"/>
          <path d="M22 5h-4"/>
          <path d="M4 17v2"/>
          <path d="M5 18H3"/>
        </svg>
        <span class="ai-button-tooltip">AI Assistant (${platformKey}+I)</span>
      `;

      // Add click handler directly
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Import and call showAIAssistant
        import('./ai-assistant-tooltip').then(({ showAIAssistant }) => {
          showAIAssistant(this.view);
        });
      });

      // Create container
      this.container = document.createElement('div');
      this.container.className = 'cm-ai-button-container';
      this.container.appendChild(button);

      // Append directly to the editor's DOM but position it absolutely
      this.view.dom.appendChild(this.container);
    }

    update(_update: ViewUpdate) {
      if (!this.container) return;

      const state = this.view.state.field(aiButtonStateField);
      this.container.style.display = state.visible ? 'block' : 'none';
    }

    destroy() {
      if (this.container) {
        this.container.remove();
        this.container = null;
      }
    }
  },
  {
    eventHandlers: {
      update(update: ViewUpdate) {
        this.update(update);
      },
    },
  },
);

// Theme for the AI button
const aiButtonTheme = EditorView.baseTheme({
  '.cm-ai-button-container': {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    zIndex: '1000',
    pointerEvents: 'auto',
  },

  '.cm-ai-assistant-button': {
    position: 'relative',
  },

  '.ai-button': {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: '0',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    pointerEvents: 'auto',

    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
      color: '#374151',
      transform: 'scale(1.05)',
    },

    '&:active': {
      transform: 'scale(0.95)',
    },

    '[data-mantine-color-scheme="dark"] &': {
      color: '#9ca3af',

      '&:hover': {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        color: '#d1d5db',
      },
    },
  },

  '.ai-button-tooltip': {
    position: 'absolute',
    bottom: '100%',
    right: '0',
    marginBottom: '8px',
    padding: '4px 8px',
    backgroundColor: '#1f2937',
    color: 'white',
    fontSize: '11px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease',
    fontFamily: 'system-ui, -apple-system, sans-serif',

    '[data-mantine-color-scheme="dark"] &': {
      backgroundColor: '#374151',
      color: '#f3f4f6',
    },

    '&::after': {
      content: '""',
      position: 'absolute',
      top: '100%',
      right: '12px',
      borderWidth: '4px',
      borderStyle: 'solid',
      borderColor: '#1f2937 transparent transparent transparent',

      '[data-mantine-color-scheme="dark"] &': {
        borderTopColor: '#374151',
      },
    },
  },

  '.ai-button:hover .ai-button-tooltip': {
    opacity: '1',
  },
});

// Export the extension
export function aiAssistantButton() {
  return [aiButtonStateField, aiButtonPlugin, aiButtonTheme];
}
