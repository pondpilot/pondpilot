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
} from './ai-assistant/effects';
import { HistoryNavigationManager } from './ai-assistant/managers/history-manager';
import { MentionManager } from './ai-assistant/managers/mention-manager';
import {
  getServicesFromState,
  aiAssistantServicesExtension,
  AIAssistantServices,
} from './ai-assistant/services-facet';
import { StructuredResponseWidget } from './ai-assistant/structured-response-widget';
import { aiAssistantTheme } from './ai-assistant/theme';
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
import { saveAIConfig, getAIConfig } from '../../utils/ai-config';
import { resolveAIContext } from '../../utils/editor/statement-parser';
import { AsyncDuckDBConnectionPool } from '../duckdb-context/duckdb-connection-pool';

class AIAssistantWidget extends WidgetType {
  private cleanup?: () => void;
  private focusTimeoutId?: number;

  constructor(
    private view: EditorView,
    private sqlStatement?: string,
    private errorContext?: TabExecutionError,
  ) {
    super();
  }

  eq(other: AIAssistantWidget) {
    return (
      other instanceof AIAssistantWidget &&
      other.sqlStatement === this.sqlStatement &&
      other.errorContext === this.errorContext
    );
  }

  toDOM() {
    const services = getServicesFromState(this.view.state);

    const handlers = createAIAssistantHandlers(
      this.view,
      this.sqlStatement,
      services,
      this.errorContext,
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
    );

    // Create input section first to get textarea and generateBtn references
    let submitWrapper: () => void;

    const { inputSection, textarea, generateBtn } = createInputSection(
      handlers.hideWidget,
      () => submitWrapper(),
      () => {}, // Placeholder for keyboard handler, will be updated
      this.errorContext,
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

    // Consolidated keyboard handler
    const handleKeyDown = (event: KeyboardEvent) => {
      // Priority 1: Mention navigation (if active)
      if (mentionManager.state.isActive) {
        if (mentionManager.handleNavigation(event)) {
          return; // Mention handled the key
        }
      }

      // Priority 2: History navigation (if not mention active and relevant keys)
      if (
        !mentionManager.state.isActive &&
        (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      ) {
        if (historyManager.handleNavigation(event)) {
          return; // History handled the key
        }
      }

      // Priority 3: Default actions (submit, hide widget)
      if (!mentionManager.state.isActive || (event.key !== 'Enter' && event.key !== 'Tab')) {
        handlers.handleTextareaKeyDown(event, submitWrapper, handlers.hideWidget);
      }
    };

    // Replace the placeholder keyboard handler
    textarea.removeEventListener('keydown', textarea.onkeydown as any);
    textarea.addEventListener('keydown', handleKeyDown);

    // Add input event listener for @ mentions and manual typing
    const handleInput = async () => {
      await mentionManager.handleInput(() => historyManager.handleManualInput());
    };

    textarea.addEventListener('input', handleInput);

    const footer = createWidgetFooter(generateBtn);

    const container = assembleAIAssistantWidget({
      contextSection,
      inputSection,
      footer,
    });

    // Enhanced cleanup
    const originalCleanup = handlers.setupEventHandlers(container, handlers.hideWidget);
    this.cleanup = () => {
      mentionManager.cleanup();
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('keydown', handleKeyDown);
      originalCleanup();
    };

    this.focusTimeoutId = window.setTimeout(() => {
      textarea.focus();
      this.focusTimeoutId = undefined;
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

    if (this.focusTimeoutId !== undefined) {
      window.clearTimeout(this.focusTimeoutId);
      this.focusTimeoutId = undefined;
    }
  }
}

// State field for AI assistant UI state
export const aiAssistantStateField = StateField.define<{
  visible: boolean;
  widgetPos?: number;
  errorContext?: TabExecutionError;
}>({
  create: () => ({ visible: false }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showAIAssistantEffect)) {
        const cursorPos = tr.state.selection.main.head;
        const line = tr.state.doc.lineAt(cursorPos);
        return {
          visible: true,
          widgetPos: line.from,
          errorContext: effect.value.errorContext,
        };
      }
      if (effect.is(hideAIAssistantEffect)) {
        return { visible: false };
      }
    }
    return value;
  },
});

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
        const resolvedContext = resolveAIContext(view.state);

        let sqlStatement: string | undefined;
        if (resolvedContext) {
          sqlStatement = resolvedContext.text;
        }

        const widget = Decoration.widget({
          widget: new AIAssistantWidget(view, sqlStatement, errorContext),
          side: 0,
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
    for (const effect of tr.effects) {
      if (effect.is(showStructuredResponseEffect)) {
        const newValue = {
          response: effect.value.response,
          position: tr.state.selection.main.head,
        };
        return newValue;
      }
      if (effect.is(hideStructuredResponseEffect)) {
        return { response: null };
      }
    }
    return value;
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
  view.dispatch({
    effects: showAIAssistantEffect.of({ view, errorContext }),
  });
  return true;
}

// Command to hide AI assistant
export function hideAIAssistant(view: EditorView): boolean {
  view.dispatch({
    effects: hideAIAssistantEffect.of(null),
  });
  return true;
}

// Keymap to prevent editor from handling events when AI assistant is active
const aiAssistantKeymap = keymap.of([
  {
    key: 'Cmd-i',
    mac: 'Cmd-i',
    preventDefault: true,
    run: (view) => {
      const aiState = view.state.field(aiAssistantStateField, false);
      if (aiState?.visible) {
        // If AI assistant is visible, hide it
        hideAIAssistant(view);
      } else {
        // If AI assistant is not visible, show it
        showAIAssistant(view);
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
