import { StateField } from '@codemirror/state';

import {
  showAIAssistantEffect,
  hideAIAssistantEffect,
  clearErrorContextEffect,
  startAIRequestEffect,
  endAIRequestEffect,
  updatePromptEffect,
} from './effects';
import { TabExecutionError } from '../../../controllers/tab/tab-controller';

// State field for AI assistant UI state
export const aiAssistantStateField = StateField.define<{
  visible: boolean;
  widgetPos?: number;
  errorContext?: TabExecutionError;
  activeRequest: boolean;
  currentPrompt?: string;
}>({
  create: () => ({ visible: false, activeRequest: false }),
  update(value, tr) {
    let newValue = value;

    // First, map the position through any document changes
    if (value.widgetPos !== undefined && tr.docChanged) {
      newValue = {
        ...value,
        widgetPos: tr.changes.mapPos(value.widgetPos),
      };
    }

    // Then handle effects
    for (const effect of tr.effects) {
      if (effect.is(showAIAssistantEffect)) {
        const cursorPos = tr.state.selection.main.head;
        const line = tr.state.doc.lineAt(cursorPos);
        return {
          visible: true,
          widgetPos: line.to, // Position at end of line to avoid content shift
          errorContext: effect.value.errorContext,
          activeRequest: value.activeRequest, // Preserve request state
        };
      }
      if (effect.is(hideAIAssistantEffect)) {
        // Clear prompt only if no active request
        return { 
          ...value, 
          visible: false,
          currentPrompt: value.activeRequest ? value.currentPrompt : undefined,
        };
      }
      if (effect.is(clearErrorContextEffect)) {
        return { ...newValue, errorContext: undefined };
      }
      if (effect.is(startAIRequestEffect)) {
        return { ...newValue, activeRequest: true };
      }
      if (effect.is(endAIRequestEffect)) {
        return { ...newValue, activeRequest: false };
      }
      if (effect.is(updatePromptEffect)) {
        return { ...newValue, currentPrompt: effect.value };
      }
    }
    return newValue;
  },
});
