import { ChatConversationId, ChatConversation } from '@models/ai-chat';

const AI_CHAT_SYNC_CHANNEL = 'ai-chat-sync';

export type AIChatSyncMessage =
  | {
      type: 'CONVERSATION_ADDED';
      conversation: ChatConversation;
    }
  | {
      type: 'CONVERSATION_UPDATED';
      conversationId: ChatConversationId;
      conversation: ChatConversation;
    }
  | {
      type: 'CONVERSATION_DELETED';
      conversationId: ChatConversationId;
    }
  | {
      type: 'CONVERSATIONS_CLEARED';
    }
  | {
      type: 'FULL_SYNC';
      conversations: Map<ChatConversationId, ChatConversation>;
    };

export class AIChatBroadcastSync {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(message: AIChatSyncMessage) => void> = new Set();

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(AI_CHAT_SYNC_CHANNEL);
      this.channel.addEventListener('message', this.handleMessage);
    }
  }

  private handleMessage = (event: MessageEvent<AIChatSyncMessage>) => {
    // Notify all listeners about the incoming message
    this.listeners.forEach((listener) => {
      try {
        listener(event.data);
      } catch (error) {
        console.error('Error in AI chat sync listener:', error);
      }
    });
  };

  broadcast(message: AIChatSyncMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (error) {
        console.error('Failed to broadcast AI chat sync message:', error);
      }
    }
  }

  subscribe(listener: (message: AIChatSyncMessage) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.channel) {
      this.channel.removeEventListener('message', this.handleMessage);
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

// Singleton instance
export const aiChatBroadcastSync = new AIChatBroadcastSync();
