import { EditorView, WidgetType } from '@codemirror/view';

import { StructuredSQLResponse } from '@models/structured-ai-response';

import {
  createResponseHeader,
  createActionsSection,
  createAlternativesSection,
  createResponseFooter,
  assembleStructuredResponseWidget,
} from './structured-response-builders';
import { createStructuredResponseHandlers } from './structured-response-handlers';

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

    this.cleanup = handlers.setupEventHandlers(container, this.response.actions);

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
