import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  MouseSensor,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { ScrollArea, Group, Skeleton, ActionIcon } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { memo, useEffect, useRef, useState } from 'react';

import { NamedIcon } from '@components/named-icon';
import { createSQLScript } from '@controllers/sql-script';
import {
  deleteTab,
  getOrCreateTabFromScript,
  setActiveTabId,
  setPreviewTabId,
  setTabOrder,
} from '@controllers/tab';
import { TabId } from '@models/tab';
import { useAppStore, useTabNameMap, useTabIconMap } from '@store/app-store';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

import { Tab } from './components';

const tabIconProps = {
  size: 16,
  className: cn('text-iconDefault-light dark:text-iconDefault-dark'),
};

export const TabsPane = memo(() => {
  /**
   * Common hooks
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /**
   * Store access
   */
  const appLoadState = useAppStore.use.appLoadState();
  const appInitializing = appLoadState === 'init';

  const previewTabId = useAppStore.use.previewTabId();
  const activeTabId = useAppStore.use.activeTabId();
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const orderedTabIds = useAppStore.use.tabOrder();
  const tabNameMap = useTabNameMap();
  const tabIconMap = useTabIconMap();

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
    deleteTab([tabId]);
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
    getOrCreateTabFromScript(newEmptyScript, true);
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
    <Group className="w-full justify-between gap-0 bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark">
      <ScrollArea type="never" className="flex-1">
        <div className={cn('flex flex-row items-center ')}>
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
                    const tabName = tabNameMap.get(tabId)!;
                    const tabIcon = tabIconMap.get(tabId)!;
                    const isLast = orderedTabIds[orderedTabIds.length - 1] === tabId;

                    return (
                      <Tab
                        key={tabId}
                        tabId={tabId}
                        name={tabName}
                        active={tabId === activeTabId}
                        preview={tabId === previewTabId}
                        loading={false} // TODO: add loading state
                        icon={<NamedIcon iconType={tabIcon} {...tabIconProps} />}
                        activeTabRef={activeTabRef}
                        handleDeleteTab={() => handleDeleteTab(tabId)}
                        onClick={() => handleTabClick(tabId)}
                        onDoubleClick={() => {
                          handleTabDoubleClick(tabId);
                        }}
                        isLast={isLast}
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
