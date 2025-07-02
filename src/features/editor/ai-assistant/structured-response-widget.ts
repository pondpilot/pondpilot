import { EditorView, WidgetType } from '@codemirror/view';

import {
  createResponseHeader,
  createActionsSection,
  createAlternativesSection,
  createResponseFooter,
  assembleStructuredResponseWidget,
} from './structured-response-builders';
import { createStructuredResponseHandlers } from './structured-response-handlers';
import { StructuredSQLResponse } from '../../../models/structured-ai-response';

export class StructuredResponseWidget extends WidgetType {
  private cleanup?: () => void;

  constructor(
    private view: EditorView,
    private response: StructuredSQLResponse,
  ) {
    super();
  }

  eq(other: StructuredResponseWidget) {
    return other instanceof StructuredResponseWidget && other.response === this.response;
  }

  toDOM() {
    const handlers = createStructuredResponseHandlers(this.view);
    const header = createResponseHeader(this.response.summary);

    const actionsSection = createActionsSection(
      this.response.actions,
      handlers.applyAction,
      handlers.hideWidget,
    );

    const alternativesSection = createAlternativesSection(
      this.response.alternatives || [],
      handlers.applyAlternative,
      handlers.hideWidget,
    );

    const footer = createResponseFooter(handlers.hideWidget);

    const container = assembleStructuredResponseWidget({
      header,
      actionsSection,
      alternativesSection,
      footer,
    });

    // Detect and apply the current theme from the parent document
    const rootElement = document.documentElement;
    const currentColorScheme = rootElement.getAttribute('data-mantine-color-scheme');
    if (currentColorScheme) {
      container.setAttribute('data-mantine-color-scheme', currentColorScheme);
    }

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

    // Enhanced cleanup to include theme observer
    const originalCleanup = handlers.setupEventHandlers(container, this.response.actions);
    this.cleanup = () => {
      themeObserver.disconnect();
      originalCleanup();
    };

    return container;
  }

  ignoreEvent() {
    return false;
  }

  destroy() {
    // Clean up event handlers when widget is destroyed
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
  }
}
