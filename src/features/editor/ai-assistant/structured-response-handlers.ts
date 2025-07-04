/**
 * Business logic handlers for Structured Response Widget
 */

import { EditorView } from '@codemirror/view';
import { showError, showSuccess } from '@components/app-notifications/app-notifications';

import { AI_ASSISTANT_TIMINGS } from './constants';
import { hideStructuredResponseEffect, clearErrorContextEffect } from './effects';
import { createCleanupRegistry } from './utils/cleanup-registry';
import { clearTabExecutionError } from '../../../controllers/tab/tab-controller';
import { SQLAction, SQLAlternative } from '../../../models/structured-ai-response';
import { useAppStore } from '../../../store/app-store';
import { copyToClipboard } from '../../../utils/clipboard';
import { resolveToNearestStatement } from '../../../utils/editor/statement-parser';

export interface StructuredResponseHandlers {
  hideWidget: () => void;
  applyAction: (action: SQLAction) => void;
  applyAlternative: (alternative: SQLAlternative) => void;
  handleKeyDown: (event: KeyboardEvent, actions: SQLAction[]) => void;
  setupEventHandlers: (container: HTMLElement, actions: SQLAction[]) => () => void;
}

/**
 * Creates handlers for structured response widget interactions
 */
export function createStructuredResponseHandlers(view: EditorView): StructuredResponseHandlers {
  const hideWidget = () => {
    if (view) {
      view.dispatch({
        effects: hideStructuredResponseEffect.of(null),
      });
      view.focus();
    }
  };

  const replaceStatementAndClose = (code: string) => {
    view.dispatch({
      effects: hideStructuredResponseEffect.of(null),
    });

    setTimeout(() => {
      if (view) {
        // Find the nearest SQL statement to replace
        const nearestStatement = resolveToNearestStatement(view.state);
        if (nearestStatement) {
          // Replace the entire statement
          view.dispatch({
            changes: { from: nearestStatement.from, to: nearestStatement.to, insert: code },
            selection: { anchor: nearestStatement.from + code.length },
          });
        } else {
          // Fallback: insert at cursor if no statement found
          const cursor = view.state.selection.main.head;
          view.dispatch({
            changes: { from: cursor, insert: code },
            selection: { anchor: cursor + code.length },
          });
        }
        view.focus();
      }
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const insertCodeAndClose = (code: string) => {
    view.dispatch({
      effects: hideStructuredResponseEffect.of(null),
    });

    setTimeout(() => {
      if (view) {
        const cursor = view.state.selection.main.head;
        view.dispatch({
          changes: { from: cursor, insert: code },
          selection: { anchor: cursor + code.length },
        });
        view.focus();
      }
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const insertAfterStatementAndClose = (code: string) => {
    view.dispatch({
      effects: hideStructuredResponseEffect.of(null),
    });

    setTimeout(() => {
      if (view) {
        // Find the nearest SQL statement or use selection
        const nearestStatement = resolveToNearestStatement(view.state);
        let insertPosition: number;

        if (nearestStatement) {
          // Insert after the end of the statement
          insertPosition = nearestStatement.to;
        } else {
          // Fallback: use selection end if no statement found
          insertPosition = view.state.selection.main.to;
        }

        const insertText = `\n\n${code}`;
        view.dispatch({
          changes: { from: insertPosition, insert: insertText },
          selection: { anchor: insertPosition + insertText.length },
        });
        view.focus();
      }
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const insertBeforeStatementAndClose = (code: string) => {
    view.dispatch({
      effects: hideStructuredResponseEffect.of(null),
    });

    setTimeout(() => {
      if (view) {
        // Find the nearest SQL statement or use selection
        const nearestStatement = resolveToNearestStatement(view.state);
        let insertPosition: number;

        if (nearestStatement) {
          // Insert before the start of the statement
          insertPosition = nearestStatement.from;
        } else {
          // Fallback: use selection start if no statement found
          insertPosition = view.state.selection.main.from;
        }

        const insertText = `${code}\n\n`;
        view.dispatch({
          changes: { from: insertPosition, insert: insertText },
          selection: { anchor: insertPosition + insertText.length },
        });
        view.focus();
      }
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const replaceEntireScriptAndClose = (code: string) => {
    view.dispatch({
      effects: hideStructuredResponseEffect.of(null),
    });

    setTimeout(() => {
      if (view) {
        const docLength = view.state.doc.length;
        view.dispatch({
          changes: { from: 0, to: docLength, insert: code },
          selection: { anchor: code.length },
        });
        view.focus();
      }
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const applyAction = (action: SQLAction) => {
    // Clear error context when applying any action (especially fix_error)
    view.dispatch({
      effects: clearErrorContextEffect.of(null),
    });

    // Also clear the error from the store for the active tab
    const store = useAppStore.getState();
    if (store.activeTabId) {
      clearTabExecutionError(store.activeTabId);
    }

    switch (action.type) {
      case 'replace_statement':
        replaceStatementAndClose(action.code);
        break;
      case 'insert_after':
        insertAfterStatementAndClose(action.code);
        break;
      case 'insert_before':
        insertBeforeStatementAndClose(action.code);
        break;
      case 'insert_at_cursor':
        insertCodeAndClose(action.code);
        break;
      case 'add_comment':
        insertBeforeStatementAndClose(action.code);
        break;
      case 'fix_error':
        replaceEntireScriptAndClose(action.code);
        break;
    }

    // Show success notification
    const notificationTitle = action.type === 'fix_error' ? 'Error Fixed' : 'Code Applied';
    const notificationMessage =
      action.type === 'fix_error'
        ? 'The SQL error has been fixed'
        : `${action.description} has been applied to your query`;

    showSuccess({
      title: notificationTitle,
      message: notificationMessage,
      autoClose: AI_ASSISTANT_TIMINGS.SUCCESS_NOTIFICATION_DURATION,
    });
  };

  const applyAlternative = (alternative: SQLAlternative) => {
    insertCodeAndClose(`\n\n${alternative.code}`);

    // Show success notification
    showSuccess({
      title: 'Alternative Applied',
      message: `${alternative.title} has been applied to your query`,
      autoClose: AI_ASSISTANT_TIMINGS.SUCCESS_NOTIFICATION_DURATION,
    });
  };

  const handleKeyDown = (event: KeyboardEvent, actions: SQLAction[]) => {
    // Always prevent event from bubbling to editor or other handlers
    event.preventDefault();
    event.stopPropagation();

    // Esc to close
    if (event.key === 'Escape') {
      hideWidget();
      return;
    }

    // Enter to apply first/recommended action
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      // Find the first recommended action, or the first action if none are recommended
      const firstAction = actions.find((action) => action.recommended) || actions[0];
      if (firstAction) {
        applyAction(firstAction);
      }
      return;
    }

    // C to copy first/recommended action code and close
    if (event.key === 'c' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const firstAction = actions.find((action) => action.recommended) || actions[0];
      if (firstAction) {
        copyToClipboard(firstAction.code, {
          showNotification: true,
          notificationTitle: 'Code Copied',
          notificationMessage: 'SQL code has been copied to clipboard',
        })
          .then(() => {
            hideWidget();
          })
          .catch((error) => {
            console.warn('Copy operation failed:', error);
            showError({
              title: 'Copy Failed',
              message: 'Unable to copy to clipboard. Please copy the code manually.',
              autoClose: 3000,
            });
          });
      }
      return;
    }

    // Arrow keys for future navigation (currently just prevent default)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      // TODO: Implement action card navigation
      return;
    }

    // Tab for future navigation (currently just prevent default)
    if (event.key === 'Tab') {
      // TODO: Implement focus cycling through actions
    }

    // All other keys are captured but ignored to prevent editor interaction
  };

  const setupEventHandlers = (container: HTMLElement, actions: SQLAction[]): (() => void) => {
    // Create cleanup registry for this widget instance
    const cleanupRegistry = createCleanupRegistry();

    // Set up keyboard navigation on the container
    container.setAttribute('tabindex', '0');

    // Create local event handler for container
    const containerKeydownHandler = (e: KeyboardEvent) => handleKeyDown(e, actions);
    cleanupRegistry.addEventListener(container, 'keydown', containerKeydownHandler);

    // Capture all keyboard events globally when widget is active
    const globalKeydownHandler = (e: KeyboardEvent) => {
      // Only handle if the widget container exists in DOM
      if (document.contains(container)) {
        handleKeyDown(e, actions);
      }
    };

    // Add global event listener to capture all keyboard input
    cleanupRegistry.addEventListener(document, 'keydown', globalKeydownHandler, true);

    // Auto-focus the container for keyboard navigation
    cleanupRegistry.setTimeout(() => {
      // Check if container is still in DOM before focusing
      if (document.contains(container)) {
        container.focus();
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);

    // Set up mutation observer for automatic cleanup when container is removed
    cleanupRegistry.observeMutations(
      document.documentElement,
      (mutations) => {
        mutations.forEach((mutation) => {
          mutation.removedNodes.forEach((node) => {
            if (node === container || (node instanceof Element && node.contains(container))) {
              cleanupRegistry.dispose();
            }
          });
        });
      },
      {
        childList: true,
        subtree: true,
      },
    );

    // Return cleanup function for manual cleanup
    return () => cleanupRegistry.dispose();
  };

  return {
    hideWidget,
    applyAction,
    applyAlternative,
    handleKeyDown,
    setupEventHandlers,
  };
}
