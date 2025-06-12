import { NewId } from './new-id';

export type ChatConversationId = NewId<'ChatConversationId'>;
export type ChatMessageId = NewId<'ChatMessageId'>;

export interface QueryResults {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}

export interface ChatMessageQuery {
  sql: string;
  successful: boolean;
  error?: string;
  results?: QueryResults;
  executionTime?: number;
  chartSpec?: any; // Vega-Lite specification
}

export interface ChatMessage {
  id: ChatMessageId;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  query?: ChatMessageQuery;
}

export interface ChatConversation {
  id: ChatConversationId;
  messages: ChatMessage[];
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatConversationState {
  conversation: ChatConversation;
  isLoading: boolean;
  error?: string;
}
