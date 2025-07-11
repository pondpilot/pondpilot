import { EditorView } from '@codemirror/view';

import { DataBaseModel } from '../../../models/db';

export interface AIAction {
  type:
    | 'replace_statement'
    | 'insert_after'
    | 'insert_before'
    | 'insert_at_cursor'
    | 'add_comment'
    | 'fix_error';
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
  queryError?: {
    errorMessage: string;
    statementType?: string;
    currentScript: string;
  };
}

// Database model types - using existing types from models
export type DatabaseModel = Map<string, DataBaseModel>;

// Database model cache
export interface DatabaseModelCache {
  data: DatabaseModel;
  timestamp: number;
}
