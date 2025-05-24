import { EditorView } from '@codemirror/view';

export interface AIAction {
  type: 'replace_statement' | 'insert_after' | 'insert_before' | 'insert_at_cursor' | 'add_comment';
  description: string;
  code: string;
  confidence?: number;
  recommended?: boolean;
}

export interface AIAlternative {
  title: string;
  description: string;
  code: string;
}

export interface StructuredAIResponse {
  summary: string;
  actions: AIAction[];
  alternatives?: AIAlternative[];
}

export interface AIAssistantContext {
  view: EditorView;
  sqlStatement?: string;
}
