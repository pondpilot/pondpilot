import { aiChatController } from '@controllers/ai-chat';
import { ChatConversationId } from '@models/ai-chat';
import { getAIConfig } from '@utils/ai-config';
import { getAIService } from '@utils/ai-service';

/**
 * Service for generating chat titles
 */
export class TitleGenerationService {
  /**
   * Generate and save a chat title based on the conversation
   */
  static async generateAndSaveChatTitle(
    conversationId: ChatConversationId,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    const titleConfig = getAIConfig();
    const titleService = getAIService(titleConfig);

    // Generate title asynchronously (don't block the UI)
    titleService.generateChatTitle(userMessage, assistantResponse).then(async (title) => {
      if (title && title !== 'New Chat') {
        aiChatController.updateConversation(conversationId, { title });
      }
    });
  }
}
