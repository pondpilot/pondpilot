import { ActionIcon } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';

import { chatInputStyles } from './styles';

interface SendButtonProps {
  onClick: () => void;
  isDisabled: boolean;
  isLoading: boolean;
}

export const SendButton = ({ onClick, isDisabled, isLoading }: SendButtonProps) => {
  return (
    <ActionIcon
      onClick={onClick}
      disabled={isDisabled}
      loading={isLoading}
      variant="subtle"
      size="lg"
      radius="md"
      className={cn(
        chatInputStyles.sendButton.base,
        !isDisabled && !isLoading
          ? chatInputStyles.sendButton.enabled
          : chatInputStyles.sendButton.disabled,
      )}
      aria-label="Send message"
    >
      <IconSend size={20} />
    </ActionIcon>
  );
};
