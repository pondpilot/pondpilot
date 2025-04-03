/* eslint-disable jsx-a11y/click-events-have-key-events */
import { ScrollArea, Group, Skeleton, Text, ActionIcon, Box, Loader } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { memo, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDndMonitor,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { IconPlus, IconX } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import {
  createSQLScript,
  createTabFromScript,
  deleteTab,
  setActiveTabId,
  setPreviewTabId,
  setTabOrder,
  useInitStore,
  useTabMetaInfoMap,
} from '@store/init-store';
import { DataSourceIcon } from '@features/data-source-icon';
import { TabId } from '@models/tab';

interface SortableTabProps {
  tabId: string;
  name: string;
  active: boolean;
  preview: boolean;
  loading: boolean;
  icon: React.ReactNode;
  activeTabRef: React.RefObject<HTMLDivElement | null>;
  handleDeleteTab: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
}

const SortableTab = ({
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
}: SortableTabProps) => {
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
          'px-2 h-9 flex items-center w-[175px] cursor-pointer border-l border-transparent004-light dark:border-transparent004-dark',
          !isDragging && 'hover:bg-transparent008-light dark:hover:bg-transparent008-dark',
          'text-textPrimary-light dark:text-textPrimary-dark',
          'bg-backgroundTertiary-light dark:bg-transparent008-dark',
          active &&
            'bg-backgroundPrimary-light hover:bg-white dark:bg-backgroundPrimary-dark z-50 dark:hover:bg-backgroundPrimary-dark',
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

const tabIconProps = {
  size: 16,
  className: cn('text-iconDefault-light dark:text-iconDefault-dark'),
};

export const TabsPane = memo(() => {
  /**
   * Common hooks
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /**
   * Store access
   */
  const appLoadState = useInitStore.use.appLoadState();
  const appInitializing = appLoadState === 'init';

  const previewTabId = useInitStore.use.previewTabId();
  const activeTabId = useInitStore.use.activeTabId();
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const orderedTabIds = useInitStore.use.tabOrder();
  const tabInfos = useTabMetaInfoMap();

  /**
   * Local state
   */
  const [isUserTabChange, setIsUserTabChange] = useState(false);

  /**
   * Handlers
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const draggedTabId = active.id as TabId;
    const overTabId = over?.id as TabId;

    if (draggedTabId !== overTabId) {
      const oldIndex = orderedTabIds.findIndex((tabId) => tabId === draggedTabId);
      const newIndex = orderedTabIds.findIndex((tabId) => tabId === overTabId);

      // Calculate the new order of tabs
      const orderedArray = arrayMove<TabId>(orderedTabIds, oldIndex, newIndex);

      // Update the state
      setTabOrder(orderedArray);
    }
  };

  const handleTabChange = (tabId: TabId) => {
    if (tabId === activeTabId) return;

    setIsUserTabChange(true);
    setActiveTabId(tabId);
  };

  const handleDeleteTab = (tabId: TabId) => {
    deleteTab(tabId);
  };

  const handleTabClick = (tabId: TabId) => {
    if (tabId === activeTabId) return;

    setIsUserTabChange(true);
    setActiveTabId(tabId);
  };

  const handleTabDoubleClick = (tabId: TabId) => {
    // Double clicking on a preview tab makes it permanent
    if (tabId === previewTabId) {
      setPreviewTabId(null);
    }

    // The rest is the same as a single click
    handleTabClick(tabId);
  };

  const handleAddQuery = () => {
    const newEmptyScript = createSQLScript();
    const newTab = createTabFromScript(newEmptyScript);
    setActiveTabId(newTab.id);
  };

  useEffect(() => {
    if (activeTabRef.current && activeTabId && !isUserTabChange) {
      activeTabRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
    setIsUserTabChange(false);
  }, [activeTabId]);

  return (
    <Group className="w-full justify-between gap-0">
      <ScrollArea type="never" className="flex-1">
        <div
          className={cn(
            'flex flex-row items-center bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
          )}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToHorizontalAxis]}
            onDragStart={({ active }) => {
              if (active.id) {
                handleTabChange(active.id as TabId);
              }
            }}
          >
            <SortableContext items={orderedTabIds} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center h-9" data-testid={setDataTestId('tabs-list')}>
                {appInitializing ? (
                  <Skeleton className="ml-2" width={100} height={20} />
                ) : (
                  orderedTabIds.map((tabId) => {
                    const tabInfo = tabInfos.get(tabId)!;

                    return (
                      <SortableTab
                        key={tabId}
                        tabId={tabId}
                        name={tabInfo.name}
                        active={tabId === activeTabId}
                        preview={tabId === previewTabId}
                        loading={false} // TODO: add loading state
                        icon={<DataSourceIcon iconType={tabInfo.iconType} {...tabIconProps} />}
                        activeTabRef={activeTabRef}
                        handleDeleteTab={() => handleDeleteTab(tabId)}
                        onClick={() => handleTabClick(tabId)}
                        onDoubleClick={() => {
                          handleTabDoubleClick(tabId);
                        }}
                      />
                    );
                  })
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>
      <ActionIcon onClick={handleAddQuery} size={28} className="mx-2" disabled={appInitializing}>
        <IconPlus size={20} />
      </ActionIcon>
    </Group>
  );
});
