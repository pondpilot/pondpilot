import { AIAssistantEditorAdapter } from './model';
import {
  createResponseHeader,
  createActionsSection,
  createAlternativesSection,
  createResponseFooter,
  assembleStructuredResponseWidget,
} from './structured-response-builders';
import { createStructuredResponseHandlers } from './structured-response-handlers';
import { StructuredSQLResponse } from '../../../models/structured-ai-response';

export class StructuredResponseWidget {
  private cleanup?: () => void;

  constructor(
    private editor: AIAssistantEditorAdapter,
    private response: StructuredSQLResponse,
    private onHide: () => void,
  ) {}

  toDOM() {
    const handlers = createStructuredResponseHandlers(this.editor, this.onHide);
    const header = createResponseHeader(this.response.summary);

    const actionsSection = createActionsSection(
      this.response.actions,
      (action) => {
        handlers.applyAction(action).catch((error) => {
          console.warn('Apply action failed:', error);
        });
      },
      handlers.hideWidget,
    );

    const alternativesSection = createAlternativesSection(
      this.response.alternatives || [],
      (alternative) => {
        handlers.applyAlternative(alternative).catch((error) => {
          console.warn('Apply alternative failed:', error);
        });
      },
      handlers.hideWidget,
    );

    const footer = createResponseFooter(handlers.hideWidget);

    const container = assembleStructuredResponseWidget({
      header,
      actionsSection,
      alternativesSection,
      footer,
    });

    const rootElement = document.documentElement;
    const currentColorScheme = rootElement.getAttribute('data-mantine-color-scheme');
    if (currentColorScheme) {
      container.setAttribute('data-mantine-color-scheme', currentColorScheme);
    }

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

    const originalCleanup = handlers.setupEventHandlers(container, this.response.actions);
    this.cleanup = () => {
      themeObserver.disconnect();
      originalCleanup();
    };

    return container;
  }

  destroy() {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
  }
}
