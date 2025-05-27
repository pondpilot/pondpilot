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
import { getTabExecutionError, TabExecutionError } from '../../controllers/tab-execution-error';
import { AI_PROVIDERS } from '../../models/ai-service';
import { StructuredSQLResponse } from '../../models/structured-ai-response';
import { useAppStore } from '../../store/app-store';
import { saveAIConfig, getAIConfig } from '../../utils/ai-config';
import { resolveAIContext } from '../../utils/editor/statement-parser';
import { AsyncDuckDBConnectionPool } from '../duckdb-context/duckdb-connection-pool';

class AIAssistantWidget extends WidgetType {
  private cleanup?: () => void;
  private focusTimeoutId?: number;

  constructor(
    private view: EditorView,
    private sqlStatement?: string,
  ) {
    super();
  }

  eq(other: AIAssistantWidget) {
    return other instanceof AIAssistantWidget && other.sqlStatement === this.sqlStatement;
  }

  toDOM() {
    const services = getServicesFromState(this.view.state);

    // Get error context for current tab
    const { activeTabId } = useAppStore.getState();
    let errorContext: TabExecutionError | undefined;
    if (activeTabId) {
      errorContext = getTabExecutionError(activeTabId);
    }

    const handlers = createAIAssistantHandlers(
      this.view,
      this.sqlStatement,
      services,
      errorContext,
    );

    // Create model selection section
    const handleModelChange = (selectedModel: string) => {
      const currentConfig = getAIConfig();

      let selectedProvider = currentConfig.provider;

      for (const provider of AI_PROVIDERS) {
        if (provider.models.some((model) => model.id === selectedModel)) {
          selectedProvider = provider.id;
          break;
        }
      }

      // Update and save the config
      const updatedConfig = {
        ...currentConfig,
        provider: selectedProvider,
        model: selectedModel,
        apiKey: currentConfig.apiKeys?.[selectedProvider] || currentConfig.apiKey,
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
      errorContext,
    );

    const { inputSection, textarea, generateBtn } = createInputSection(
      handlers.hideWidget,
      () => handlers.handleSubmit(textarea, generateBtn),
      (event) =>
        handlers.handleTextareaKeyDown(
          event,
          () => handlers.handleSubmit(textarea, generateBtn),
          handlers.hideWidget,
        ),
      errorContext,
    );

    const footer = createWidgetFooter(generateBtn);

    const container = assembleAIAssistantWidget({
      contextSection,
      inputSection,
      footer,
    });

    this.cleanup = handlers.setupEventHandlers(container, handlers.hideWidget);

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
}>({
  create: () => ({ visible: false }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showAIAssistantEffect)) {
        const cursorPos = tr.state.selection.main.head;
        const line = tr.state.doc.lineAt(cursorPos);
        return { visible: true, widgetPos: line.from };
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
      const { visible, widgetPos } = state;

      const decorations: Range<Decoration>[] = [];

      if (visible && widgetPos !== undefined) {
        const resolvedContext = resolveAIContext(view.state);

        let sqlStatement: string | undefined;
        if (resolvedContext) {
          sqlStatement = resolvedContext.text;
        }

        const widget = Decoration.widget({
          widget: new AIAssistantWidget(view, sqlStatement),
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
    constructor(private view: EditorView) {}

    update() {
      const insertionText = this.view.state.field(aiTextInsertionField, false);
      if (insertionText) {
        const cursor = this.view.state.selection.main.head;
        this.view.dispatch({
          changes: { from: cursor, insert: insertionText },
          selection: { anchor: cursor + insertionText.length },
        });

        // Clear the insertion text
        this.view.dispatch({
          effects: insertAIResponseEffect.of(''),
        });
      }
    }
  },
);

// Command to show AI assistant
export function showAIAssistant(view: EditorView): boolean {
  view.dispatch({
    effects: showAIAssistantEffect.of(view),
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
    key: 'Cmd-b',
    mac: 'Cmd-b',
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
) {
  return [
    aiAssistantServicesExtension(connectionPool, services),
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
