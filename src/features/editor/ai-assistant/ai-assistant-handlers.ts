/**
 * Business logic handlers for AI Assistant widget
 */

import { EditorView } from '@codemirror/view';

import { AI_ASSISTANT_TIMINGS } from './constants';
import {
  hideAIAssistantEffect,
  showStructuredResponseEffect,
  insertAIResponseEffect,
} from './effects';
import { handleAIServiceError, handleSchemaContextError } from './error-handler';
import { AIAssistantServices } from './services-facet';
import { preventEventPropagation } from './ui-factories';
import { TabExecutionError } from '../../../controllers/tab-execution-error';

export interface AIAssistantHandlers {
  hideWidget: () => void;
  handleSubmit: (textarea: HTMLTextAreaElement, generateBtn: HTMLButtonElement) => Promise<void>;
  handleTextareaKeyDown: (event: KeyboardEvent, onSubmit: () => void, onClose: () => void) => void;
  handleContainerKeyDown: (event: KeyboardEvent, onClose: () => void) => void;
  setupEventHandlers: (container: HTMLElement, onClose: () => void) => () => void;
}

/**
 * Creates handlers for AI Assistant widget interactions
 */
export function createAIAssistantHandlers(
  view: EditorView,
  sqlStatement: string | undefined,
  services: AIAssistantServices,
  errorContext?: TabExecutionError,
): AIAssistantHandlers {
  const hideWidget = () => {
    if (view) {
      view.dispatch({
        effects: hideAIAssistantEffect.of(null),
      });
      view.focus();
    }
  };

  const handleSubmit = async (textarea: HTMLTextAreaElement, generateBtn: HTMLButtonElement) => {
    const query = textarea.value.trim();

    // If no query and no error context, don't proceed
    if (!query && !errorContext) return;

    // Disable controls and show loading state
    generateBtn.disabled = true;
    textarea.disabled = true;

    // Start animated dots
    let dotCount = 0;
    const animateLoadingDots = () => {
      dotCount = (dotCount + 1) % 4;
      generateBtn.textContent = '.'.repeat(dotCount || 1);
    };
    animateLoadingDots(); // Initial call
    const dotsInterval = setInterval(
      animateLoadingDots,
      AI_ASSISTANT_TIMINGS.LOADING_DOTS_INTERVAL,
    );

    try {
      // Generate schema context if connection is available
      let schemaContext: string | undefined;
      const dbConnectionPool = services.connectionPool;

      if (dbConnectionPool) {
        try {
          const context = await services.schemaContextService.generateSchemaContext(
            dbConnectionPool,
            sqlStatement,
          );
          schemaContext = services.schemaContextService.formatSchemaContextForAI(context);
        } catch (error) {
          handleSchemaContextError(error);
        }
      }

      // If there's an error context, include current script and enhance prompt
      let enhancedPrompt = query;
      let queryError;

      if (errorContext) {
        const currentScript = view.state.doc.toString();
        queryError = {
          errorMessage: errorContext.errorMessage,
          statementType: errorContext.statementType,
          currentScript,
        };

        // If user just triggers AI without typing, suggest fixing the error
        if (!query || query === '') {
          enhancedPrompt = 'Fix the SQL error in the current script';
        }
      }

      const aiRequest = {
        prompt: enhancedPrompt,
        sqlContext: sqlStatement,
        schemaContext,
        useStructuredResponse: true,
        queryError,
      };

      const response = await services.aiService.generateSQLAssistance(aiRequest);

      if (response.success) {
        if (response.structuredResponse) {
          // Handle structured response - hide AI assistant and show action selection UI
          view.dispatch({
            effects: [
              hideAIAssistantEffect.of(null),
              showStructuredResponseEffect.of({
                response: response.structuredResponse,
                view,
              }),
            ],
          });
        } else if (response.content) {
          // Fallback to text response
          view.dispatch({
            effects: [hideAIAssistantEffect.of(null), insertAIResponseEffect.of(response.content)],
          });
        }
      } else {
        handleAIServiceError(response.error, textarea, query);
      }
    } catch (error) {
      handleAIServiceError(error, textarea, query);
    } finally {
      // Clear the animation and re-enable controls
      clearInterval(dotsInterval);
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate';
      textarea.disabled = false;
    }
  };

  const handleTextareaKeyDown = (
    event: KeyboardEvent,
    onSubmit: () => void,
    onClose: () => void,
  ) => {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        // Shift+Enter: Allow default behavior for new line
        return;
      }
      // Enter: Send query to AI service
      event.preventDefault();
      event.stopPropagation();
      onSubmit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    // Prevent event from bubbling to editor
    event.stopPropagation();
  };

  const handleContainerKeyDown = (event: KeyboardEvent, onClose: () => void) => {
    // Capture all keyboard events to prevent editor from receiving them
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const setupEventHandlers = (container: HTMLElement, onClose: () => void): (() => void) => {
    // Prevent all events from bubbling to editor
    preventEventPropagation(container);

    // Handle container-level keyboard events
    const keydownHandler = (e: KeyboardEvent) => {
      handleContainerKeyDown(e, onClose);
    };
    container.addEventListener('keydown', keydownHandler);

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', keydownHandler);
    };
  };

  return {
    hideWidget,
    handleSubmit,
    handleTextareaKeyDown,
    handleContainerKeyDown,
    setupEventHandlers,
  };
}
