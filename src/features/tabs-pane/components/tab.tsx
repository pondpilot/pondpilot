import { useDndMonitor } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Group, Text, ActionIcon, Box, Loader } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { useState } from 'react';

interface TabProps {
  tabId: string;
  name: string;
  active: boolean;
  preview: boolean;
  loading: boolean;
  icon: React.ReactNode;
  activeTabRef: React.RefObject<HTMLDivElement | null>;
  isLast: boolean;
  handleDeleteTab: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
}

export const Tab = ({
  tabId,
  name,
  active,
  preview,
  loading,
  icon,
  activeTabRef,
  handleDeleteTab,
  onClick,
  onDoubleClick,
  isLast,
}: TabProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tabId });
  const [isDragging, setIsDragging] = useState(false);

  useDndMonitor({
    onDragStart() {
      setIsDragging(true);
    },
    onDragEnd() {
      setIsDragging(false);
    },
    onDragCancel() {
      setIsDragging(false);
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Box
        ref={(el) => {
          if (active) {
            activeTabRef.current = el;
          }
        }}
        data-testid={setDataTestId(`data-tab-handle-${tabId}`)}
        data-tab-handle-active={active}
        data-tab-handle-preview={preview}
        onClick={onClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick();
        }}
        className={cn(
          'px-2 h-9 flex items-center w-[175px] cursor-pointer border-l border-transparent008-light dark:border-transparent008-dark',
          !isDragging && 'hover:bg-transparent008-light dark:hover:bg-transparent008-dark',
          'text-textPrimary-light dark:text-textPrimary-dark',
          'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
          active &&
            'bg-backgroundPrimary-light hover:bg-white dark:bg-backgroundPrimary-dark z-20 dark:hover:bg-backgroundPrimary-dark',
          isLast && 'border-r',
        )}
      >
        <Group gap={2} className="justify-between w-full">
          <Group gap={4}>
            {loading ? <Loader color="icon-default" size={16} /> : icon}
            <Text maw={110} truncate="end" className={cn(preview && 'italic', 'select-none')}>
              {name}
            </Text>
          </Group>
          <ActionIcon
            data-testid={setDataTestId('close-tab-button')}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteTab();
            }}
            size={20}
          >
            <IconX size={20} className={cn('text-iconDefault-light dark:text-iconDefault-dark')} />
          </ActionIcon>
        </Group>
      </Box>
    </div>
  );
};
