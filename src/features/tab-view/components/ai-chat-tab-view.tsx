import { ChatConversation } from '@features/ai-chat';
import { Stack } from '@mantine/core';
import { TabId } from '@models/tab';

interface AIChatTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const AIChatTabView = ({ tabId, active }: AIChatTabViewProps) => {
  return (
    <Stack className="h-full gap-0">
      <ChatConversation tabId={tabId} active={active} />
    </Stack>
  );
};
