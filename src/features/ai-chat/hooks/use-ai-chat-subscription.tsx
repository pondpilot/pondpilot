import { aiChatController } from '@controllers/ai-chat';
import { useEffect, useState } from 'react';

export const useAIChatSubscription = () => {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    // Subscribe to AI chat controller changes
    const unsubscribe = aiChatController.subscribe(() => {
      forceUpdate({});
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);
};
