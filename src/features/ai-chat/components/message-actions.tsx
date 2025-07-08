import { ActionIcon, Group, Menu, Tooltip } from '@mantine/core';
import { IconCopy, IconPencil, IconTrash, IconDots } from '@tabler/icons-react';

interface MessageActionsProps {
  isUser: boolean;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

export const MessageActions = ({
  isUser,
  onCopy,
  onEdit,
  onDelete,
  className,
}: MessageActionsProps) => {
  return (
    <Group gap={4} className={className}>
      <Tooltip label="Copy message">
        <ActionIcon
          size="sm"
          variant="subtle"
          onClick={onCopy}
          data-testid="ai-chat-copy-message"
          className="hover:bg-transparent008-light dark:hover:bg-transparent008-dark"
        >
          <IconCopy size={14} />
        </ActionIcon>
      </Tooltip>

      {onEdit && (
        <Tooltip label="Edit message">
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={onEdit}
            data-testid="ai-chat-edit-message"
            className="hover:bg-transparent008-light dark:hover:bg-transparent008-dark"
          >
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      {onDelete && (
        <Tooltip label="Delete message">
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={onDelete}
            data-testid="ai-chat-delete-message"
            className="hover:bg-transparent008-light dark:hover:bg-transparent008-dark"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      {!isUser && (
        <Menu shadow="md" width={152} position="bottom-end">
          <Menu.Target>
            <ActionIcon
              size="sm"
              variant="subtle"
              className="hover:bg-transparent008-light dark:hover:bg-transparent008-dark"
            >
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onCopy} leftSection={<IconCopy size={14} />}>
              Copy
            </Menu.Item>
            {onEdit && (
              <Menu.Item onClick={onEdit} leftSection={<IconPencil size={14} />}>
                Edit
              </Menu.Item>
            )}
            {onDelete && (
              <Menu.Item onClick={onDelete} leftSection={<IconTrash size={14} />}>
                Delete
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  );
};
