import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { TabExecutionError } from '../../../controllers/tab/tab-controller';
import { StructuredSQLResponse } from '../../../models/structured-ai-response';

// Effects for showing and hiding AI assistant
export const showAIAssistantEffect = StateEffect.define<{
  view: EditorView;
  errorContext?: TabExecutionError;
}>();
export const hideAIAssistantEffect = StateEffect.define<null>();
export const insertAIResponseEffect = StateEffect.define<string>();
export const showStructuredResponseEffect = StateEffect.define<{
  response: StructuredSQLResponse;
  view: EditorView;
}>();
export const hideStructuredResponseEffect = StateEffect.define<null>();
export const clearErrorContextEffect = StateEffect.define<null>();

// Effects for tracking AI request state
export const startAIRequestEffect = StateEffect.define<null>();
export const endAIRequestEffect = StateEffect.define<null>();
