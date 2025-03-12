/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useAppContext } from '@features/app-context';
import { TabModel } from '@features/app-context/models';
import { ScrollArea, Group, Skeleton, Text, ActionIcon, Box } from '@mantine/core';
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
import { useEditorStore } from 'store/editor-store';

interface SortableTabProps {
  tab: TabModel;
  activeTab: TabModel | null;
  icon: React.ReactNode;
  activeTabRef: React.RefObject<HTMLDivElement | null>;
  onTabUpdate: (tab: TabModel) => void;
  handleDeleteTab: (tab: TabModel) => void;
  onClick: (tab: TabModel) => void;
}

const SortableTab = ({
  tab,
  activeTab,
  activeTabRef,
  onTabUpdate,
  handleDeleteTab,
  onClick,
  icon,
}: SortableTabProps) => {
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
  const active = activeTab?.id === tab.id;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Box
        ref={(el) => {
          if (active) {
            activeTabRef.current = el;
          }
        }}
        data-active={active}
        onClick={() => onClick(tab)}
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
            {icon}
            <Text maw={110} truncate="end" className={cn(!tab.stable && 'italic', 'select-none')}>
              {tab.path}
            </Text>
          </Group>
          <ActionIcon
            data-testid="close-tab-button"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteTab(tab);
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

export const TabsPane = memo(() => {
  /**
   * Common hooks
   */
  const { onDeleteTabs, onTabUpdate, onOpenView, onSetTabsOrder, onCreateQueryFile, onSaveEditor } =
    useAppContext();
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
  const tabs = useAppStore((state) => state.tabs);
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setQueryView = useAppStore((state) => state.setQueryView);
  const setCurrentQuery = useAppStore((state) => state.setCurrentQuery);
  const setQueryResults = useAppStore((state) => state.setQueryResults);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const appStatus = useAppStore((state) => state.appStatus);
  const setTabs = useAppStore((state) => state.setTabs);
  const queryView = useAppStore((state) => state.queryView);
  const queryResults = useAppStore((state) => state.queryResults);
  const sessionFiles = useAppStore((state) => state.sessionFiles);

  const editorValue = useEditorStore((state) => state.editorValue);
  const lastQueryDirty = useEditorStore((state) => state.lastQueryDirty);
  const setLastQueryDirty = useEditorStore((state) => state.setLastQueryDirty);

  const appInitializing = appStatus === 'initializing';

  /**
   * Local state
   */
  const [isUserTabChange, setIsUserTabChange] = useState(false);

  /**
   * Handlers
   */
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
      const newIndex = tabs.findIndex((tab) => tab.id === over.id);

      const newTabs = [...tabs];
      const [removed] = newTabs.splice(oldIndex, 1);
      newTabs.splice(newIndex, 0, removed);

      const activeTabIndex = newTabs.findIndex((tab) => tab.id === activeTab?.id);

      setTabs(newTabs);
      onSetTabsOrder({
        tabs: newTabs,
        activeTabIndex,
      });
    }
  };

  const saveCurrentQuery = async () => {
    if (activeTab?.mode === 'query' && lastQueryDirty) {
      await onSaveEditor({ content: editorValue, path: activeTab.path });
      setLastQueryDirty(false);
    }
  };

  const handleTabChange = async (tabId: string | null) => {
    setIsUserTabChange(true);
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.id === activeTab?.id) return;
    await saveCurrentQuery();

    setActiveTab(tab);

    if (tab.mode === 'view') {
      onOpenView(tab.path);
    }
    if (tab.mode === 'query') {
      setCurrentView(null);
      setQueryResults(null);
      setQueryView(true);
      setCurrentQuery(tab.path);
    }
  };

  const handleDeleteTab = async (tab: TabModel) => {
    await saveCurrentQuery();
    onDeleteTabs([tab]);
  };

  const handleTabClick = async (tab: TabModel) => {
    if (tab.id === activeTab?.id) return;

    await saveCurrentQuery();

    setIsUserTabChange(true);
    setActiveTab(tab);
    if (tab.mode === 'view') {
      onOpenView(tab.path);
    }
    if (tab.mode === 'query') {
      setCurrentView(null);
      setQueryResults(null);
      setQueryView(true);
      setCurrentQuery(tab.path);
    }
  };

  const handleAddQuery = async () => {
    await saveCurrentQuery();
    onCreateQueryFile({ entities: [{ name: 'query' }], openInNewTab: true });
  };

  const handleCopyToClipboard = () => {
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
      const fileExt = sessionFiles?.sources.find((f) => f.name === id)?.ext as string;
      if (!fileExt) return <IconCode {...iconProps} />;

      const iconsMap = {
        csv: <IconCsv {...iconProps} />,
        json: <IconJson {...iconProps} />,
      }[fileExt];
      return iconsMap || <IconTable {...iconProps} />;
    },
    [sessionFiles],
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

  if (!tabs.length) {
    return null;
  }

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
              items={tabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex items-center h-9" data-testid="tabs-list">
                {tabs.map((tab) => (
                  <SortableTab
                    key={tab.id}
                    tab={tab}
                    activeTab={activeTab}
                    activeTabRef={activeTabRef}
                    onTabUpdate={onTabUpdate}
                    handleDeleteTab={handleDeleteTab}
                    onClick={handleTabClick}
                    icon={getIcon(tab.path)}
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
      {!queryView && (
        <Group className=" bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark h-full px-4">
          <ActionIcon size={16} onClick={handleCopyToClipboard}>
            <IconCopy />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
});
