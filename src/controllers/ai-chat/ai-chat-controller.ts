import { ChatConversation, ChatConversationId, ChatMessage, ChatMessageId } from '@models/ai-chat';
import { makeIdFactory } from '@utils/new-id';

const makeConversationId = makeIdFactory<ChatConversationId>();
const makeMessageId = makeIdFactory<ChatMessageId>();

export class AIChatController {
  private conversations: Map<ChatConversationId, ChatConversation> = new Map();

  createConversation(title?: string): ChatConversation {
    const conversation: ChatConversation = {
      id: makeConversationId(),
      messages: [],
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  getConversation(id: ChatConversationId): ChatConversation | undefined {
    return this.conversations.get(id);
  }

  updateConversation(id: ChatConversationId, updates: Partial<ChatConversation>): void {
    const conversation = this.conversations.get(id);
    if (conversation) {
      Object.assign(conversation, updates, { updatedAt: new Date() });
    }
  }

  deleteConversation(id: ChatConversationId): void {
    this.conversations.delete(id);
  }

  addMessage(conversationId: ChatConversationId, message: Omit<ChatMessage, 'id'>): ChatMessage | undefined {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return undefined;

    const newMessage: ChatMessage = {
      ...message,
      id: makeMessageId(),
    };

    conversation.messages.push(newMessage);
    conversation.updatedAt = new Date();

    return newMessage;
  }

  updateMessage(
    conversationId: ChatConversationId,
    messageId: ChatMessageId,
    updates: Partial<ChatMessage>
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex((m) => m.id === messageId);
    if (messageIndex !== -1) {
      Object.assign(conversation.messages[messageIndex], updates);
      conversation.updatedAt = new Date();
    }
  }

  deleteMessage(conversationId: ChatConversationId, messageId: ChatMessageId): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.messages = conversation.messages.filter((m) => m.id !== messageId);
    conversation.updatedAt = new Date();
  }

  getAllConversations(): ChatConversation[] {
    return Array.from(this.conversations.values());
  }

  clearConversation(conversationId: ChatConversationId): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.messages = [];
      conversation.updatedAt = new Date();
    }
  }

  getTrimmedMessages(conversationId: ChatConversationId, maxTokens: number): ChatMessage[] {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return [];

    // Simple token estimation: ~4 chars per token
    const estimateTokens = (message: ChatMessage): number => {
      let tokens = message.content.length / 4;
      if (message.query) {
        tokens += message.query.sql.length / 4;
        if (message.query.error) {
          tokens += message.query.error.length / 4;
        }
      }
      return Math.ceil(tokens);
    };

    const messages = [...conversation.messages];
    let totalTokens = 0;
    const trimmedMessages: ChatMessage[] = [];

    // Keep messages from the end until we hit the token limit
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const messageTokens = estimateTokens(messages[i]);
      if (totalTokens + messageTokens > maxTokens && trimmedMessages.length > 0) {
        break;
      }
      trimmedMessages.unshift(messages[i]);
      totalTokens += messageTokens;
    }

    return trimmedMessages;
  }
}

export const aiChatController = new AIChatController();
