/**
 * Business logic handlers for AI Assistant widget
 */

import { EditorView } from '@codemirror/view';

import {
  hideAIAssistantEffect,
  showStructuredResponseEffect,
  insertAIResponseEffect,
  startAIRequestEffect,
  endAIRequestEffect,
} from './effects';
import { handleAIServiceError, handleSchemaContextError } from './error-handler';
import { extractMentions } from './mention-autocomplete';
import { getPromptHistoryManager } from './prompt-history';
import { AIAssistantServices } from './services-facet';
import { aiAssistantStateField } from './state-field';
import { preventEventPropagation } from './ui-factories';
import { categorizeMentions, expandDatabaseMentions } from './utils/mention-categorization';
import { getDatabaseModel } from '../../../controllers/db/duckdb-meta';
import { TabExecutionError } from '../../../controllers/tab/tab-controller';

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
  cursorContext?: { isOnEmptyLine: boolean; hasExistingQuery: boolean },
): AIAssistantHandlers {
  const hideWidget = () => {
    if (view) {
      // Check if there's an active request
      const aiState = view.state.field(aiAssistantStateField);
      if (aiState.activeRequest) {
        // Don't hide the widget if request is active
        return;
      }

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

    // Check if there's already an active request
    const aiState = view.state.field(aiAssistantStateField);
    if (aiState.activeRequest) {
      // Don't proceed if request is already active
      return;
    }

    // Dispatch effect to mark request as active
    view.dispatch({
      effects: startAIRequestEffect.of(null),
    });

    // Disable controls and show loading state
    generateBtn.disabled = true;
    textarea.disabled = true;

    generateBtn.classList.add('ai-widget-loading');
    const originalText = generateBtn.textContent;
    generateBtn.textContent = '';

    // Create loading dots element
    const loadingDots = document.createElement('span');
    loadingDots.className = 'ai-widget-loading-dots';
    loadingDots.textContent = '...';
    generateBtn.appendChild(loadingDots);

    try {
      // Extract mentioned tables, databases, and scripts from the query
      const mentions = extractMentions(query);
      const allMentionedTables: string[] = [];
      let mentionedScripts = new Set<string>();

      // Generate schema context if connection is available
      let schemaContext: string | undefined;
      let scriptContext: string | undefined;
      const dbConnectionPool = services.connectionPool;

      if (dbConnectionPool || services.sqlScripts) {
        try {
          // Check mentions against database model and scripts to categorize properly
          const databaseModel = dbConnectionPool
            ? await getDatabaseModel(dbConnectionPool)
            : undefined;

          // Extract all mention strings from the prompt
          const allMentions = [...mentions.tables, ...mentions.databases, ...mentions.scripts];

          // Categorize mentions using the extracted utility
          const categorized = categorizeMentions(allMentions, databaseModel, services.sqlScripts);
          mentionedScripts = categorized.mentionedScriptIds;
          const { mentionedDbNames } = categorized;
          const { mentionedTableNames } = categorized;

          // Add mentioned tables to the list
          mentionedTableNames.forEach((table) => allMentionedTables.push(table));

          // Expand @db mentions to include all tables in that database
          if (mentionedDbNames.size > 0) {
            const expandedTables = expandDatabaseMentions(mentionedDbNames, databaseModel);
            expandedTables.forEach((table) => {
              if (!allMentionedTables.includes(table)) {
                allMentionedTables.push(table);
              }
            });
          }

          if (dbConnectionPool) {
            const context = await services.schemaContextService.generateSchemaContext(
              dbConnectionPool,
              sqlStatement,
              allMentionedTables, // Pass all tables including expanded from databases
            );
            schemaContext = services.schemaContextService.formatSchemaContextForAI(context);
          }

          // Generate script context for mentioned scripts
          if (mentionedScripts.size > 0 && services.sqlScripts) {
            const scriptContents: string[] = [];
            for (const scriptId of mentionedScripts) {
              const script = services.sqlScripts.get(scriptId);
              if (script) {
                scriptContents.push(`-- Script: ${script.name}\n${script.content}`);
              }
            }
            if (scriptContents.length > 0) {
              scriptContext = `Referenced SQL Scripts:\n\n${scriptContents.join('\n\n')}`;
            }
          }
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

      // Combine schema and script contexts
      let combinedContext = schemaContext;
      if (scriptContext) {
        combinedContext = combinedContext
          ? `${combinedContext}\n\n${scriptContext}`
          : scriptContext;
      }

      const aiRequest = {
        prompt: enhancedPrompt,
        sqlContext: sqlStatement,
        schemaContext: combinedContext,
        useStructuredResponse: true,
        queryError,
        cursorContext,
      };

      const response = await services.aiService.generateSQLAssistance(aiRequest);

      if (response.success) {
        // Save successful prompts to history (use original query, not enhanced)
        if (query) {
          const historyManager = getPromptHistoryManager();
          historyManager.addPrompt(query);
        }

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
      // Dispatch effect to mark request as complete
      view.dispatch({
        effects: endAIRequestEffect.of(null),
      });

      // Remove loading state and restore original text
      generateBtn.classList.remove('ai-widget-loading');
      generateBtn.innerHTML = ''; // Clear loading dots
      generateBtn.textContent = originalText || 'Generate';
      generateBtn.disabled = false;
      textarea.disabled = false;
    }
  };

  // Helper function to check if keyboard event is a copy/paste operation
  const isCopyPasteKeyEvent = (event: KeyboardEvent): boolean => {
    if (!(event.metaKey || event.ctrlKey)) return false;

    const key = event.key.toLowerCase();
    return key === 'c' || key === 'v' || key === 'x' || key === 'a';
  };

  // Helper function to check if keyboard event is toggle AI assistant
  const isToggleAIAssistantEvent = (event: KeyboardEvent): boolean => {
    const key = event.key.toLowerCase();
    return key === 'i' && (event.metaKey || event.ctrlKey);
  };

  // Helper function to handle common keyboard event logic
  const handleKeyboardEventPropagation = (event: KeyboardEvent): boolean => {
    // Allow Cmd+i/Ctrl+i to propagate to toggle AI assistant
    if (isToggleAIAssistantEvent(event)) {
      return true; // Let event bubble up
    }

    if (isCopyPasteKeyEvent(event)) {
      // Just stop propagation to prevent editor from handling it
      event.stopPropagation();
      return true; // Event was handled
    }

    // Prevent all other events from bubbling to editor
    event.stopPropagation();
    return false; // Event needs further processing
  };

  const handleTextareaKeyDown = (
    event: KeyboardEvent,
    onSubmit: () => void,
    onClose: () => void,
  ) => {
    // Check if it's Cmd+i/Ctrl+i and let it bubble up to toggle AI assistant
    if (isToggleAIAssistantEvent(event)) {
      return; // Don't handle, let it bubble up
    }

    // Handle common keyboard event logic
    if (handleKeyboardEventPropagation(event)) {
      return; // Copy/paste event was handled
    }

    // Handle specific textarea keys
    switch (event.key) {
      case 'Enter':
        if (!event.shiftKey) {
          // Enter without Shift: Send query to AI service
          event.preventDefault();
          onSubmit();
        }
        // Shift+Enter: Allow default behavior for new line
        break;

      case 'Escape':
        event.preventDefault();
        onClose();
        break;
    }
  };

  const handleContainerKeyDown = (event: KeyboardEvent, onClose: () => void) => {
    // Check if it's Cmd+i/Ctrl+i and let it bubble up to toggle AI assistant
    if (isToggleAIAssistantEvent(event)) {
      return; // Don't handle, let it bubble up
    }

    // Handle common keyboard event logic
    if (handleKeyboardEventPropagation(event)) {
      return; // Copy/paste event was handled
    }

    // Handle escape for container
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
