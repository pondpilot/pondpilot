import { NamedIcon } from '@components/named-icon';
import { ActionIcon, Divider, Group, Menu, Text, Tooltip } from '@mantine/core';
import { IconDotsVertical, IconX } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';

import { TreeNodeData } from '../../model';

interface TreeNodeContentProps<NTypeToIdTypeMap extends Record<string, any>> {
  level: number;
  node: TreeNodeData<NTypeToIdTypeMap>;
  isActive: boolean;
  menuOpened: boolean;
  tooltip?: string;
  hasContextMenu: boolean;
  nodeRef: React.RefObject<HTMLDivElement | null>;
  onNodeClick: (e: React.MouseEvent) => void;
  onContextMenuClick?: (e: React.MouseEvent) => void;
  onStartRename?: () => void;
  onCloseItemClick?: (e: React.MouseEvent) => void;
  onOpenMenuButton?: (e: React.MouseEvent) => void;
}

const ConditionalTooltip = ({
  tooltip,
  children,
}: {
  tooltip?: string;
  children: React.ReactNode;
}) => {
  if (tooltip) {
    return (
      <Tooltip label={tooltip} position="top" withArrow openDelay={500}>
        {children}
      </Tooltip>
    );
  }
  return <>{children}</>;
};

export function TreeNodeContent<NTypeToIdTypeMap extends Record<string, any>>({
  level,
  node,
  isActive,
  menuOpened,
  tooltip,
  hasContextMenu,
  nodeRef,
  onNodeClick,
  onContextMenuClick,
  onStartRename,
  onCloseItemClick,
  onOpenMenuButton,
}: TreeNodeContentProps<NTypeToIdTypeMap>) {
  const { iconType, label, onCloseItemClick: nodeCloseHandler } = node;

  const content = (
    <Group
      onClick={onNodeClick}
      onContextMenu={onContextMenuClick}
      onDoubleClick={onStartRename}
      gap={5}
      wrap="nowrap"
      className={cn('cursor-pointer h-[30px] px-1 rounded group')}
      ref={nodeRef}
    >
      {level !== 1 && <Divider orientation="vertical" />}
      {isActive && nodeCloseHandler && onCloseItemClick ? (
        <ActionIcon size={18} onClick={onCloseItemClick}>
          <IconX />
        </ActionIcon>
      ) : (
        <div
          className="text-iconDefault-light dark:text-iconDefault-dark p-[1px]"
          data-dnd-drag-icon="true"
        >
          <NamedIcon iconType={iconType} size={16} />
        </div>
      )}

      <Text
        c={
          label === 'File Views' || label === 'Comparisons' || label.startsWith('[DB] ')
            ? 'dimmed'
            : 'text-primary'
        }
        className={cn(
          'text-sm px-1',
          (label === 'File Views' || label === 'Comparisons' || label.startsWith('[DB] ')) &&
            'italic',
        )}
        lh="18px"
        truncate
      >
        {label.startsWith('[DB] ') ? label.substring(5) : label}
      </Text>

      {hasContextMenu && onOpenMenuButton && (
        <Menu.Target>
          <ActionIcon
            onClick={onOpenMenuButton}
            className={cn('opacity-0 group-hover:opacity-100', menuOpened && 'opacity-100')}
            ml="auto"
            size={16}
          >
            <IconDotsVertical size={16} />
          </ActionIcon>
        </Menu.Target>
      )}
    </Group>
  );

  return hasContextMenu ? (
    content
  ) : (
    <ConditionalTooltip tooltip={tooltip}>{content}</ConditionalTooltip>
  );
}
