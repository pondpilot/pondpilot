import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { StructuredSQLResponse } from '../../../models/structured-ai-response';

// Effects for showing and hiding AI assistant
export const showAIAssistantEffect = StateEffect.define<EditorView>();
export const hideAIAssistantEffect = StateEffect.define<null>();
export const insertAIResponseEffect = StateEffect.define<string>();
export const showStructuredResponseEffect = StateEffect.define<{
  response: StructuredSQLResponse;
  view: EditorView;
}>();
export const hideStructuredResponseEffect = StateEffect.define<null>();
