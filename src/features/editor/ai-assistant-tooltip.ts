/* eslint-disable max-classes-per-file */
import { StateField, Range } from '@codemirror/state';
import {
  EditorView,
  WidgetType,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  keymap,
} from '@codemirror/view';

import { createAIAssistantHandlers } from './ai-assistant/ai-assistant-handlers';
import {
  showAIAssistantEffect,
  hideAIAssistantEffect,
  insertAIResponseEffect,
  showStructuredResponseEffect,
  hideStructuredResponseEffect,
  updatePromptEffect,
} from './ai-assistant/effects';
import { HistoryNavigationManager } from './ai-assistant/managers/history-manager';
import { MentionManager } from './ai-assistant/managers/mention-manager';
import {
  getServicesFromState,
  aiAssistantServicesExtension,
  AIAssistantServices,
} from './ai-assistant/services-facet';
import { aiAssistantStateField } from './ai-assistant/state-field';
import { StructuredResponseWidget } from './ai-assistant/structured-response-widget';
import { aiAssistantTheme } from './ai-assistant/theme';
import { createCleanupRegistry } from './ai-assistant/utils/cleanup-registry';
import {
  createCombinedContextSection,
  createInputSection,
  createWidgetFooter,
  createModelSelectionSection,
  assembleAIAssistantWidget,
} from './ai-assistant/widget-builders';
import { TabExecutionError } from '../../controllers/tab/tab-controller';
import { AI_PROVIDERS } from '../../models/ai-service';
import { SQLScript } from '../../models/sql-script';
import { StructuredSQLResponse } from '../../models/structured-ai-response';
import { useAppStore } from '../../store/app-store';
import { saveAIConfig, getAIConfig } from '../../utils/ai-config';
import { resolveAIContext } from '../../utils/editor/statement-parser';
import { AsyncDuckDBConnectionPool } from '../duckdb-context/duckdb-connection-pool';

class AIAssistantWidget extends WidgetType {
  private cleanup?: () => void;

  constructor(
    private view: EditorView,
    private sqlStatement?: string,
    private errorContext?: TabExecutionError,
    private cursorContext?: { isOnEmptyLine: boolean; hasExistingQuery: boolean },
  ) {
    super();
  }

  eq(other: AIAssistantWidget) {
    if (!(other instanceof AIAssistantWidget)) return false;

    // Get the current AI state to compare activeRequest
    const currentState = this.view.state.field(aiAssistantStateField);
    const otherState = other.view.state.field(aiAssistantStateField);

    // Only recreate if structural properties change
    return (
      this.sqlStatement === other.sqlStatement &&
      this.errorContext === other.errorContext &&
      currentState.activeRequest === otherState.activeRequest &&
      currentState.visible === otherState.visible
    );
  }

  toDOM() {
    const services = getServicesFromState(this.view.state);
    const aiState = this.view.state.field(aiAssistantStateField);

    const handlers = createAIAssistantHandlers(
      this.view,
      this.sqlStatement,
      services,
      this.errorContext,
      this.cursorContext,
    );

    // Create model selection section
    const handleModelChange = (selectedModel: string) => {
      const currentConfig = getAIConfig();

      let selectedProvider = currentConfig.provider;
      let isReasoningModel = false;

      // Check if it's a custom model
      if (currentConfig.customModels?.some((model) => model.id === selectedModel)) {
        selectedProvider = 'custom';
      } else {
        // Otherwise, find the provider for this model
        for (const provider of AI_PROVIDERS) {
          const model = provider.models.find((m) => m.id === selectedModel);
          if (model) {
            selectedProvider = provider.id;
            isReasoningModel = model.reasoning || false;
            break;
          }
        }
      }

      // Update and save the config
      const updatedConfig = {
        ...currentConfig,
        provider: selectedProvider,
        model: selectedModel,
        apiKey: currentConfig.apiKeys?.[selectedProvider] || currentConfig.apiKey,
        reasoning: isReasoningModel,
      };

      saveAIConfig(updatedConfig);
      services.aiService.updateConfig(updatedConfig);
    };

    const { modelSelect } = createModelSelectionSection(handleModelChange);

    // Create combined context section with embedded model selector
    const contextSection = createCombinedContextSection(
      this.sqlStatement,
      this.view,
      services.connectionPool,
      modelSelect,
      this.errorContext,
      handlers.hideWidget,
      aiState.activeRequest,
    );

    // Create input section first to get textarea and generateBtn references
    let submitWrapper: () => void;

    const { inputSection, textarea, generateBtn } = createInputSection(
      () => submitWrapper(),
      () => {}, // Placeholder for keyboard handler, will be updated
      this.errorContext,
      aiState.activeRequest,
      aiState.currentPrompt,
      (value) => {
        // Update prompt in state
        this.view.dispatch({
          effects: updatePromptEffect.of(value),
        });
      },
    );

    // Now set up managers with the textarea and button references
    const mentionManager = new MentionManager(textarea, generateBtn, services);
    const historyManager = new HistoryNavigationManager(textarea);

    // Update the submit wrapper now that we have mention and history
    submitWrapper = () => {
      // Don't submit if mention dropdown is active
      if (!mentionManager.state.isActive) {
        historyManager.resetHistory();
        handlers.handleSubmit(textarea, generateBtn);
      }
    };

    // Helper function to check if mention manager should handle the event
    const shouldMentionHandleKey = (event: KeyboardEvent): boolean => {
      if (!mentionManager.state.isActive) return false;
      return mentionManager.handleNavigation(event);
    };

    // Helper function to check if history manager should handle the event
    const shouldHistoryHandleKey = (event: KeyboardEvent): boolean => {
      if (mentionManager.state.isActive) return false;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
      return historyManager.handleNavigation(event);
    };

    // Helper function to check if default handler should process the event
    const shouldUseDefaultHandler = (event: KeyboardEvent): boolean => {
      // Use default handler if mention is not active
      if (!mentionManager.state.isActive) return true;

      // Use default handler if key is not Enter or Tab
      // (When mention is active, Enter/Tab are used for selection)
      return event.key !== 'Enter' && event.key !== 'Tab';
    };

    // Consolidated keyboard handler with clear priority chain
    const handleKeyDown = (event: KeyboardEvent) => {
      // Priority chain: Mention → History → Default
      if (shouldMentionHandleKey(event)) {
        return; // Mention handled the key
      }

      if (shouldHistoryHandleKey(event)) {
        return; // History handled the key
      }

      if (shouldUseDefaultHandler(event)) {
        handlers.handleTextareaKeyDown(event, submitWrapper, handlers.hideWidget);
      }
    };

    // Create cleanup registry for this widget instance
    const cleanupRegistry = createCleanupRegistry();

    // Replace the placeholder keyboard handler
    textarea.removeEventListener('keydown', textarea.onkeydown as any);
    cleanupRegistry.addEventListener(textarea, 'keydown', handleKeyDown);

    // Add input event listener for @ mentions and manual typing
    const handleInput = async () => {
      // Update prompt in state
      this.view.dispatch({
        effects: updatePromptEffect.of(textarea.value),
      });
      await mentionManager.handleInput(() => historyManager.handleManualInput());
    };

    cleanupRegistry.addEventListener(textarea, 'input', handleInput);

    const footer = createWidgetFooter(generateBtn);

    const container = assembleAIAssistantWidget({
      contextSection,
      inputSection,
      footer,
    });

    // Set up mutation observer to watch for theme changes
    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-mantine-color-scheme'
        ) {
          const newColorScheme = document.documentElement.getAttribute('data-mantine-color-scheme');
          if (newColorScheme) {
            container.setAttribute('data-mantine-color-scheme', newColorScheme);
          }
        }
      });
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mantine-color-scheme'],
    });

    // Enhanced cleanup
    const originalCleanup = handlers.setupEventHandlers(container, handlers.hideWidget);
    cleanupRegistry.register(() => {
      mentionManager.cleanup();
      themeObserver.disconnect();
      originalCleanup();
    });

    this.cleanup = () => cleanupRegistry.dispose();

    cleanupRegistry.setTimeout(() => {
      textarea.focus();
    }, 0);

    return container;
  }

  ignoreEvent() {
    return false;
  }

  destroy() {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
  }
}

// ViewPlugin to handle AI assistant widget rendering
const aiAssistantWidgetPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || this.needsRebuild(update)) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    needsRebuild(update: ViewUpdate): boolean {
      return (
        update.state.field(aiAssistantStateField) !==
        update.startState?.field(aiAssistantStateField)
      );
    }

    buildDecorations(view: EditorView): DecorationSet {
      const state = view.state.field(aiAssistantStateField);
      const { visible, widgetPos, errorContext } = state;

      const decorations: Range<Decoration>[] = [];

      if (visible && widgetPos !== undefined) {
        // Validate that the position is within document bounds
        const docLength = view.state.doc.length;
        if (widgetPos > docLength) {
          // Position is out of bounds, don't render the widget
          return Decoration.set([]);
        }

        const resolvedContext = resolveAIContext(view.state);

        let sqlStatement: string | undefined;
        if (resolvedContext) {
          sqlStatement = resolvedContext.text;
        }

        // Detect cursor context for better AI action type selection
        const cursorPos = view.state.selection.main.head;
        const currentLine = view.state.doc.lineAt(cursorPos);
        const isOnEmptyLine = currentLine.text.trim() === '';
        const hasExistingQuery = view.state.doc.toString().trim().length > 0;

        const widget = Decoration.widget({
          widget: new AIAssistantWidget(view, sqlStatement, errorContext, {
            isOnEmptyLine,
            hasExistingQuery,
          }),
          side: 1, // Place widget after the position to avoid layout shift
        });
        decorations.push(widget.range(widgetPos));
      }

      return Decoration.set(decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// Structured response display handler
const structuredResponseField = StateField.define<{
  response: StructuredSQLResponse | null;
  position?: number;
}>({
  create: () => ({ response: null }),
  update(value, tr) {
    let newValue = value;

    // First, map the position through any document changes
    if (value.position !== undefined && tr.docChanged) {
      newValue = {
        ...value,
        position: tr.changes.mapPos(value.position),
      };
    }

    // Then handle effects
    for (const effect of tr.effects) {
      if (effect.is(showStructuredResponseEffect)) {
        return {
          response: effect.value.response,
          position: tr.state.selection.main.head,
        };
      }
      if (effect.is(hideStructuredResponseEffect)) {
        return { response: null };
      }
    }
    return newValue;
  },
});

// ViewPlugin to handle structured response widget rendering
const structuredResponseWidgetPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || this.needsRebuild(update)) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    needsRebuild(update: ViewUpdate): boolean {
      return (
        update.state.field(structuredResponseField) !==
        update.startState?.field(structuredResponseField)
      );
    }

    buildDecorations(view: EditorView): DecorationSet {
      const state = view.state.field(structuredResponseField);
      const { response, position } = state;

      const decorations: Range<Decoration>[] = [];

      if (response && position !== undefined) {
        // Validate that the position is within document bounds
        const docLength = view.state.doc.length;
        if (position > docLength) {
          // Position is out of bounds, don't render the widget
          return Decoration.set([]);
        }

        const widget = Decoration.widget({
          widget: new StructuredResponseWidget(view, response),
          side: 1,
        });
        decorations.push(widget.range(position));
      }

      return Decoration.set(decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// Text insertion handler
const aiTextInsertionField = StateField.define<string | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(insertAIResponseEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// ViewPlugin to handle text insertion
const aiAssistantViewPlugin = ViewPlugin.fromClass(
  class {
    private pendingInsertion: string | null = null;

    constructor(private view: EditorView) {}

    update(update: ViewUpdate) {
      // Check if we have pending text to insert
      const insertionText = update.state.field(aiTextInsertionField, false);
      if (insertionText && insertionText !== this.pendingInsertion) {
        this.pendingInsertion = insertionText;
        // Schedule the insertion after the current update completes
        setTimeout(() => {
          if (this.pendingInsertion) {
            const { state } = this.view;
            const cursor = state.selection.main.head;
            const line = state.doc.lineAt(cursor);

            // Format the response as a multiline SQL comment
            const lines = this.pendingInsertion.split('\n');

            // Create comment with proper formatting
            let formattedComment = '/*\n';
            formattedComment += ' * AI Assistant Response:\n';
            formattedComment += ` * ${'-'.repeat(50)}\n`;

            // Process each line, preserving empty lines for readability
            lines.forEach((textLine) => {
              if (textLine.trim() === '') {
                formattedComment += ' *\n';
              } else {
                // Wrap long lines at 80 characters
                const maxLineLength = 77; // 80 - 3 for ' * '
                if (textLine.length > maxLineLength) {
                  const words = textLine.split(' ');
                  let currentLine = '';
                  words.forEach((word) => {
                    if (currentLine.length + word.length + 1 > maxLineLength) {
                      formattedComment += ` * ${currentLine.trim()}\n`;
                      currentLine = `${word} `;
                    } else {
                      currentLine += `${word} `;
                    }
                  });
                  if (currentLine.trim()) {
                    formattedComment += ` * ${currentLine.trim()}\n`;
                  }
                } else {
                  formattedComment += ` * ${textLine}\n`;
                }
              }
            });

            formattedComment += ' */\n';

            // Insert at the beginning of the current line
            this.view.dispatch({
              changes: { from: line.from, insert: formattedComment },
              selection: { anchor: line.from + formattedComment.length },
              effects: insertAIResponseEffect.of(''), // Clear the field in the same transaction
            });
            this.pendingInsertion = null;
          }
        }, 0);
      }
    }
  },
);

// Command to show AI assistant
export function showAIAssistant(view: EditorView, errorContext?: TabExecutionError): boolean {
  // Check if there's an active structured response
  const structuredState = view.state.field(structuredResponseField, false);
  if (structuredState?.response) {
    // Don't show AI assistant if structured response is active
    return false;
  }

  view.dispatch({
    effects: showAIAssistantEffect.of({ view, errorContext }),
  });
  return true;
}

// Command to hide AI assistant
export function hideAIAssistant(view: EditorView): boolean {
  // Check if there's an active request
  const aiState = view.state.field(aiAssistantStateField, false);
  if (aiState?.activeRequest) {
    // Don't hide the widget if request is active
    return false;
  }

  view.dispatch({
    effects: hideAIAssistantEffect.of(null),
  });
  // Restore focus to the editor
  view.focus();
  return true;
}

// Keymap to prevent editor from handling events when AI assistant is active
const aiAssistantKeymap = keymap.of([
  {
    key: 'Control-i',
    mac: 'Cmd-i',
    preventDefault: true,
    run: (view) => {
      const aiState = view.state.field(aiAssistantStateField, false);
      if (aiState?.visible) {
        // If AI assistant is visible, hide it
        hideAIAssistant(view);
      } else {
        // If AI assistant is not visible, show it
        // Try to get error context from the global store
        const store = useAppStore.getState();

        // Get the active tab ID
        const tabId = store.activeTabId;

        const errorContext = tabId ? store.tabExecutionErrors.get(tabId) : undefined;
        showAIAssistant(view, errorContext);
      }
      return true;
    },
  },
  {
    key: 'Escape',
    preventDefault: true,
    run: (view) => {
      const aiState = view.state.field(aiAssistantStateField, false);
      if (aiState?.visible) {
        hideAIAssistant(view);
        return true; // Prevent other escape handlers
      }
      return false; // Let other escape handlers run
    },
  },
]);

// Export the structured response field for external use
export { structuredResponseField };

// Export the extension
export function aiAssistantTooltip(
  connectionPool?: AsyncDuckDBConnectionPool | null,
  services?: AIAssistantServices,
  sqlScripts?: Map<string, SQLScript>,
) {
  return [
    aiAssistantServicesExtension(connectionPool, services, sqlScripts),
    aiAssistantStateField,
    aiAssistantWidgetPlugin,
    structuredResponseField,
    structuredResponseWidgetPlugin,
    aiTextInsertionField,
    aiAssistantViewPlugin,
    aiAssistantKeymap,
    aiAssistantTheme,
  ];
}
