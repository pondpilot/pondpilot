import { ChatConversation, ChatConversationId, ChatMessage, ChatMessageId } from '@models/ai-chat';
import { makeIdFactory } from '@utils/new-id';

const makeConversationId = makeIdFactory<ChatConversationId>();
const makeMessageId = makeIdFactory<ChatMessageId>();

type Listener = () => void;

export class AIChatController {
  private conversations: Map<ChatConversationId, ChatConversation> = new Map();
  private listeners: Set<Listener> = new Set();

  createConversation(title?: string): ChatConversation {
    const conversation: ChatConversation = {
      id: makeConversationId(),
      messages: [],
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    this.notify();
    return conversation;
  }

  getConversation(id: ChatConversationId): ChatConversation | undefined {
    return this.conversations.get(id);
  }

  updateConversation(id: ChatConversationId, updates: Partial<ChatConversation>): void {
    const conversation = this.conversations.get(id);
    if (conversation) {
      const updatedConversation: ChatConversation = {
        ...conversation,
        ...updates,
        updatedAt: new Date(),
      };

      this.conversations.set(id, updatedConversation);
      this.notify();
    }
  }

  deleteConversation(id: ChatConversationId): void {
    this.conversations.delete(id);
    this.notify();
  }

  addMessage(
    conversationId: ChatConversationId,
    message: Omit<ChatMessage, 'id'>,
  ): ChatMessage | undefined {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return undefined;

    const newMessage: ChatMessage = {
      ...message,
      id: makeMessageId(),
    };

    // Create new conversation with added message
    const updatedConversation: ChatConversation = {
      ...conversation,
      messages: [...conversation.messages, newMessage],
      updatedAt: new Date(),
    };

    this.conversations.set(conversationId, updatedConversation);
    this.notify();

    return newMessage;
  }

  updateMessage(
    conversationId: ChatConversationId,
    messageId: ChatMessageId,
    updates: Partial<ChatMessage>,
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex((m) => m.id === messageId);
    if (messageIndex !== -1) {
      // Create new message array with updated message
      const updatedMessages = [...conversation.messages];
      updatedMessages[messageIndex] = {
        ...conversation.messages[messageIndex],
        ...updates,
      };

      // Create new conversation object
      const updatedConversation: ChatConversation = {
        ...conversation,
        messages: updatedMessages,
        updatedAt: new Date(),
      };

      this.conversations.set(conversationId, updatedConversation);
      this.notify();
    }
  }

  deleteMessage(conversationId: ChatConversationId, messageId: ChatMessageId): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    // Create new conversation with filtered messages
    const updatedConversation: ChatConversation = {
      ...conversation,
      messages: conversation.messages.filter((m) => m.id !== messageId),
      updatedAt: new Date(),
    };

    this.conversations.set(conversationId, updatedConversation);
    this.notify();
  }

  getAllConversations(): ChatConversation[] {
    return Array.from(this.conversations.values());
  }

  clearConversation(conversationId: ChatConversationId): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      const updatedConversation: ChatConversation = {
        ...conversation,
        messages: [],
        updatedAt: new Date(),
      };

      this.conversations.set(conversationId, updatedConversation);
      this.notify();
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

  // Event system methods
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  // Hydration method for loading persisted data
  hydrate(conversations: ChatConversation[]): void {
    this.conversations.clear();
    conversations.forEach((conversation) => {
      this.conversations.set(conversation.id, conversation);
    });
    this.notify();
  }
}

export const aiChatController = new AIChatController();
