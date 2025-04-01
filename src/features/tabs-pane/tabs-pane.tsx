/* eslint-disable jsx-a11y/click-events-have-key-events */
import { ScrollArea, Group, Skeleton, Text, ActionIcon, Box, Loader } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@store/app-store';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDndMonitor,
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
import {
  IconCode,
  IconCopy,
  IconCsv,
  IconJson,
  IconPlus,
  IconTable,
  IconX,
} from '@tabler/icons-react';
import { getArrowTableSchema } from '@utils/arrow/helpers';
import { useAppNotifications } from '@components/app-notifications';
import { setDataTestId } from '@utils/test-id';
import {
  TabMetaInfo,
  tabStoreApi,
  useAllTabsQuery,
  useSetActiveTabMutation,
  useDeleteTabsMutatuion,
  useTabsReorderMutation,
  useUpdateTabMutation,
  useFileHandlesQuery,
} from '@store/app-idb-store';
import { tableFromIPC } from 'apache-arrow';

interface SortableTabProps {
  tab: TabMetaInfo;
  active: boolean;
  loading: boolean;
  icon: React.ReactNode;
  activeTabRef: React.RefObject<HTMLDivElement | null>;
  handleDeleteTab: (id: string) => void;
  onClick: (tab: string) => void;
}

const SortableTab = ({
  tab,
  active,
  activeTabRef,
  handleDeleteTab,
  onClick,
  icon,
  loading,
}: SortableTabProps) => {
  const { mutateAsync: onTabUpdate } = useUpdateTabMutation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id });
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
        data-active={active}
        onClick={() => onClick(tab.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onTabUpdate({ ...tab, stable: true });
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
            <Text maw={110} truncate="end" className={cn(!tab.stable && 'italic', 'select-none')}>
              {tab.name}
            </Text>
          </Group>
          <ActionIcon
            data-testid={setDataTestId('close-tab-button')}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteTab(tab.id);
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

interface TabsPaneProps {
  onAddTabClick: () => void;
}

export const TabsPane = memo(({ onAddTabClick }: TabsPaneProps) => {
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
  const { showSuccess } = useAppNotifications();

  /**
   * Store access
   */
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const { data: tabs = [] } = useAllTabsQuery();
  const activeTab = tabs.find((tab) => tab.active);
  const { data: dataSources = [] } = useFileHandlesQuery();
  const { mutateAsync: setActiveTab } = useSetActiveTabMutation();
  const { mutateAsync: onDeleteTabs } = useDeleteTabsMutatuion();

  const appStatus = useAppStore((state) => state.appStatus);

  const appInitializing = appStatus === 'initializing';

  const isEditorView = activeTab?.type === 'query';

  /**
   * Local state
   */
  const [isUserTabChange, setIsUserTabChange] = useState(false);
  const [localTabs, setLocalTabs] = useState<TabMetaInfo[]>([]);

  /**
   * Handlers
   */
  const reorderMutation = useTabsReorderMutation();

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = localTabs.findIndex((tab) => tab.id === active.id);
      const newIndex = localTabs.findIndex((tab) => tab.id === over.id);

      const orderedArray = arrayMove<TabMetaInfo>(localTabs, oldIndex, newIndex);
      setLocalTabs(orderedArray);
      // Simply swap the order values between source and target tabs
      await reorderMutation.mutateAsync(
        orderedArray.map((tab, index) => ({
          ...tab,
          order: index,
        })),
      );
    }
  };

  const saveCurrentQuery = async () => {
    // if (activeTab?.mode === 'query' && lastQueryDirty) {
    //   await onSaveEditor({ content: editorValue, path: activeTab.path });
    //   setLastQueryDirty(false);
    // }
  };

  const handleTabChange = async (tabId: string | null) => {
    setIsUserTabChange(true);
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.id === activeTab?.id) return;
    await saveCurrentQuery();

    await setActiveTab(tab.id);
  };

  const handleDeleteTab = async (id: string) => {
    await saveCurrentQuery();
    onDeleteTabs([id]);
  };

  const handleTabClick = async (id: string) => {
    if (id === activeTab?.id) return;

    await saveCurrentQuery();

    setIsUserTabChange(true);
    await setActiveTab(id);
  };

  const handleAddQuery = async () => {
    await saveCurrentQuery();
    onAddTabClick();
  };

  //TODO: Move to a separate file / hook
  const handleCopyToClipboard = async () => {
    if (!activeTab) return;

    const tabData = await tabStoreApi.getTab(activeTab?.id);
    const queryResults = tabData?.dataView.data ? tableFromIPC(tabData?.dataView.data) : null;

    if (!queryResults) return;

    if (!queryResults || queryResults.numRows === 0) return { columns: [], data: [] };

    const data = queryResults.toArray().map((row) => row.toJSON());

    const columns = getArrowTableSchema(queryResults) || [];

    if (Array.isArray(data) && Array.isArray(columns)) {
      const headers = columns.map((col) => col.name).join('\t');

      const rows = data.map((row) => columns.map((col) => row[col.name] ?? '').join('\t'));

      const tableText = [headers, ...rows].join('\n');

      navigator.clipboard.writeText(tableText);
      showSuccess({
        title: 'Table copied to clipboard',
        message: '',
        autoClose: 800,
      });
    }
  };

  const getIcon = useCallback(
    (id: string | undefined) => {
      const iconProps = {
        size: 16,
        className: cn('text-iconDefault-light dark:text-iconDefault-dark'),
      };
      const fileExt = dataSources.find((f) => f.name === id)?.ext as string;
      if (!fileExt) return <IconCode {...iconProps} />;

      const iconsMap = {
        csv: <IconCsv {...iconProps} />,
        json: <IconJson {...iconProps} />,
      }[fileExt];
      return iconsMap || <IconTable {...iconProps} />;
    },
    [dataSources],
  );

  useEffect(() => {
    if (activeTabRef.current && activeTab && !isUserTabChange) {
      activeTabRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
    setIsUserTabChange(false);
  }, [activeTab]);

  useEffect(() => {
    // Only update localTabs if they're different from the current tabs
    // This prevents unnecessary re-renders
    const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

    // Deep comparison to avoid unnecessary updates
    const areTabsEqual = JSON.stringify(sortedTabs) === JSON.stringify(localTabs);
    if (!areTabsEqual) {
      setLocalTabs(sortedTabs);
    }
  }, [tabs]);

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
                handleTabChange(active.id as string);
              }
            }}
          >
            <SortableContext
              items={localTabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex items-center h-9" data-testid={setDataTestId('tabs-list')}>
                {localTabs.map((tab) => (
                  <SortableTab
                    key={tab.id}
                    tab={tab}
                    active={tab.id === activeTab?.id}
                    activeTabRef={activeTabRef}
                    handleDeleteTab={handleDeleteTab}
                    onClick={handleTabClick}
                    loading={tab.query.state === 'fetching'}
                    icon={getIcon('query')}
                  />
                ))}
                {appInitializing && <Skeleton className="ml-2" width={100} height={20} />}
              </div>
            </SortableContext>
          </DndContext>
          <ActionIcon onClick={handleAddQuery} size={28} className="mx-2">
            <IconPlus size={20} />
          </ActionIcon>
        </div>
      </ScrollArea>
      {!isEditorView && (
        <Group className=" bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark h-full px-4">
          <ActionIcon size={16} onClick={handleCopyToClipboard}>
            <IconCopy />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
});
