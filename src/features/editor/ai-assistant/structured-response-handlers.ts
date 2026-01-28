/**
 * Business logic handlers for Structured Response Widget
 */

import { showError, showSuccess } from '@components/app-notifications/app-notifications';

import { AI_ASSISTANT_TIMINGS } from './constants';
import { AIAssistantEditorAdapter } from './model';
import { createCleanupRegistry } from './utils/cleanup-registry';
import { clearTabExecutionError } from '../../../controllers/tab/tab-controller';
import { SQLAction, SQLAlternative } from '../../../models/structured-ai-response';
import { useAppStore } from '../../../store/app-store';
import { copyToClipboard } from '../../../utils/clipboard';
import { resolveToNearestStatement } from '../../../utils/editor/statement-parser';

export interface StructuredResponseHandlers {
  hideWidget: () => void;
  applyAction: (action: SQLAction) => Promise<void>;
  applyAlternative: (alternative: SQLAlternative) => Promise<void>;
  handleKeyDown: (event: KeyboardEvent, actions: SQLAction[]) => void;
  setupEventHandlers: (container: HTMLElement, actions: SQLAction[]) => () => void;
}

/**
 * Creates handlers for structured response widget interactions
 */
export function createStructuredResponseHandlers(
  editor: AIAssistantEditorAdapter,
  onHide: () => void,
): StructuredResponseHandlers {
  const hideWidget = () => {
    onHide();
    editor.focus();
  };

  const replaceStatementAndClose = async (code: string) => {
    onHide();

    setTimeout(async () => {
      const selection = editor.getSelection();
      const nearestStatement = await resolveToNearestStatement(editor.getValue(), selection.from);
      if (nearestStatement) {
        editor.replaceRange(code, nearestStatement.from, nearestStatement.to);
      } else {
        editor.insertText(code, editor.getCursorOffset());
      }
      editor.focus();
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const insertCodeAndClose = async (code: string) => {
    onHide();

    setTimeout(() => {
      const cursor = editor.getCursorOffset();
      editor.insertText(code, cursor);
      editor.focus();
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const insertAfterStatementAndClose = async (code: string) => {
    onHide();

    setTimeout(async () => {
      const selection = editor.getSelection();
      const nearestStatement = await resolveToNearestStatement(editor.getValue(), selection.from);
      const insertPosition = nearestStatement ? nearestStatement.to : selection.to;
      editor.insertText(`\n\n${code}`, insertPosition);
      editor.focus();
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const insertBeforeStatementAndClose = async (code: string) => {
    onHide();

    setTimeout(async () => {
      const selection = editor.getSelection();
      const nearestStatement = await resolveToNearestStatement(editor.getValue(), selection.from);
      const insertPosition = nearestStatement ? nearestStatement.from : selection.from;
      editor.insertText(`${code}\n\n`, insertPosition);
      editor.focus();
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const replaceEntireScriptAndClose = async (code: string) => {
    onHide();

    setTimeout(() => {
      const currentValue = editor.getValue();
      editor.replaceRange(code, 0, currentValue.length);
      editor.focus();
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);
  };

  const applyAction = async (action: SQLAction) => {
    // Clear error context when applying any action (especially fix_error)
    const store = useAppStore.getState();
    if (store.activeTabId) {
      clearTabExecutionError(store.activeTabId);
    }

    switch (action.type) {
      case 'replace_statement':
        await replaceStatementAndClose(action.code);
        break;
      case 'insert_after':
        await insertAfterStatementAndClose(action.code);
        break;
      case 'insert_before':
        await insertBeforeStatementAndClose(action.code);
        break;
      case 'insert_at_cursor':
        await insertCodeAndClose(action.code);
        break;
      case 'add_comment':
        await insertBeforeStatementAndClose(action.code);
        break;
      case 'fix_error':
        await replaceEntireScriptAndClose(action.code);
        break;
    }

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

  const applyAlternative = async (alternative: SQLAlternative) => {
    await insertCodeAndClose(`\n\n${alternative.code}`);

    showSuccess({
      title: 'Alternative Applied',
      message: `${alternative.title} has been applied to your query`,
      autoClose: AI_ASSISTANT_TIMINGS.SUCCESS_NOTIFICATION_DURATION,
    });
  };

  const handleKeyDown = (event: KeyboardEvent, actions: SQLAction[]) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      hideWidget();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const firstAction = actions.find((action) => action.recommended) || actions[0];
      if (firstAction) {
        applyAction(firstAction).catch((error) => {
          console.warn('Apply action failed:', error);
        });
      }
      return;
    }

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
    }
  };

  const setupEventHandlers = (container: HTMLElement, actions: SQLAction[]): (() => void) => {
    const cleanupRegistry = createCleanupRegistry();

    container.setAttribute('tabindex', '0');

    const containerKeydownHandler = (e: KeyboardEvent) => handleKeyDown(e, actions);
    cleanupRegistry.addEventListener(container, 'keydown', containerKeydownHandler);

    // Prevent Monaco from capturing wheel events so the widget can scroll
    const wheelHandler = (e: WheelEvent) => {
      e.stopPropagation();
    };
    cleanupRegistry.addEventListener(container, 'wheel', wheelHandler);

    const globalKeydownHandler = (e: KeyboardEvent) => {
      if (document.contains(container)) {
        handleKeyDown(e, actions);
      }
    };

    cleanupRegistry.addEventListener(document, 'keydown', globalKeydownHandler, true);

    cleanupRegistry.setTimeout(() => {
      if (document.contains(container)) {
        container.focus();
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, AI_ASSISTANT_TIMINGS.NEXT_TICK_DELAY);

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
