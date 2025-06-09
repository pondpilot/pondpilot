import { ChatConversation, ChatConversationId } from '@models/ai-chat';
import { openDB } from 'idb';

import { aiChatController } from './ai-chat-controller';

const STORE_NAME = 'AIChatConversations';
const STORE_VERSION = 1;

interface AIChatDB {
  conversations: {
    key: ChatConversationId;
    value: ChatConversation;
  };
}

export async function saveAIChatConversations(): Promise<void> {
  const db = await openDB<AIChatDB>(STORE_NAME, STORE_VERSION, {
    upgrade(database) {
      database.createObjectStore('conversations', { keyPath: 'id' });
    },
  });

  const conversations = aiChatController.getAllConversations();
  const tx = db.transaction('conversations', 'readwrite');

  // Clear existing and add all
  await tx.objectStore('conversations').clear();
  for (const conversation of conversations) {
    await tx.objectStore('conversations').add(conversation);
  }

  await tx.done;
  db.close();
}

export async function loadAIChatConversations(): Promise<void> {
  try {
    const db = await openDB<AIChatDB>(STORE_NAME, STORE_VERSION, {
      upgrade(database) {
        database.createObjectStore('conversations', { keyPath: 'id' });
      },
    });

    const conversations = await db.getAll('conversations');
    db.close();

    if (conversations && conversations.length > 0) {
      // Restore conversations with proper date objects
      const restoredConversations = conversations.map((conversation: ChatConversation) => ({
        ...conversation,
        createdAt: new Date(conversation.createdAt),
        updatedAt: new Date(conversation.updatedAt),
        messages: conversation.messages.map((msg) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
      }));

      // Use hydrate method to restore conversations
      aiChatController.hydrate(restoredConversations);
    }
  } catch (error) {
    console.error('Failed to load AI chat conversations:', error);
  }
}

export async function deletePersistedConversation(
  conversationId: ChatConversationId,
): Promise<void> {
  aiChatController.deleteConversation(conversationId);
  await saveAIChatConversations();
}

export async function updatePersistedConversation(
  conversationId: ChatConversationId,
  updates: Partial<ChatConversation>,
): Promise<void> {
  aiChatController.updateConversation(conversationId, updates);
  await saveAIChatConversations();
}
