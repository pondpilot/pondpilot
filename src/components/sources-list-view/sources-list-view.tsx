import { IconType, ListViewIcon } from '@components/list-view-icon';
import {
  Stack,
  Group,
  Text,
  Menu,
  Skeleton,
  Tree,
  useTree,
  getTreeExpandedState,
  TreeNodeData,
  ActionIcon,
  Divider,
  TextInput,
  Popover,
} from '@mantine/core';
import { useDidUpdate, useHotkeys } from '@mantine/hooks';
import { IconDotsVertical, IconX } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

export interface TypedTreeNodeData<ItemID extends string = string> extends TreeNodeData {
  value: ItemID;
  label: string;
  iconType: IconType;
  children?: TypedTreeNodeData<ItemID>[];
}

interface MenuItemChildren<ItemID extends string = string> {
  label: string;
  onClick: (item: TypedTreeNodeData<ItemID>) => void;
}

export interface MenuItem<ItemID extends string = string> {
  children: MenuItemChildren<ItemID>[];
}

export interface ListItemProps<ItemID extends string = string> {
  itemId: ItemID;
  disabled?: boolean;
  active: boolean;
  menuItems: MenuItem<ItemID>[];
  label: string;
  node: TypedTreeNodeData<ItemID>;
  iconType: IconType;
  level: number;
  onClick: (e: React.MouseEvent) => void;
  onItemDoubleClick?: () => void;
  onActiveCloseClick?: () => void;
}

interface ListViewProps<ItemID extends string = string> {
  list: TypedTreeNodeData<ItemID>[];
  activeItemKey: ItemID | null;
  parentDataTestId: string;

  disabled?: boolean;
  loading?: boolean;
  menuItems: MenuItem<ItemID>[];
  renameItemId?: ItemID | null;
  renameValue?: string;
  isItemRenaming?: boolean;
  renameInputError?: string;
  onRenameChange?: React.ChangeEventHandler<HTMLInputElement>;

  onRenameClose?: () => void;
  onRenameSubmit?: () => void;
  onItemRename?: (itemId: ItemID) => void;
  onDeleteSelected: (itemIds: ItemID[]) => void;
}

const itemClasses = {
  base: 'cursor-pointer h-[30px] rounded group bg-transparent !outline-none',
  disabled: 'opacity-50 cursor-default',
  transparent004: 'bg-transparent004-light dark:bg-transparent004-dark',
  transparent008: 'bg-transparent008-light dark:bg-transparent008-dark',
  hover: {
    default: 'hover:bg-transparent004-light dark:hover:bg-transparent004-dark',
    active: 'hover:bg-transparent008-light dark:hover:bg-transparent008-dark',
  },
};

const ListItem = <ItemID extends string = string>({
  label,
  onClick,
  itemId,
  disabled,
  active,
  menuItems,
  node,
  iconType,
  onActiveCloseClick,
  level,
  onItemDoubleClick,
}: ListItemProps<ItemID>) => {
  const [menuOpened, setMenuOpened] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number | undefined;
    y: number | undefined;
  }>({ x: 0, y: 0 });

  const menuStyles =
    menuPosition.x && menuPosition.y
      ? {
          top: menuPosition.y + 15,
          left: menuPosition.x - 10,
        }
      : undefined;

  const handleContextMenu = (event: React.MouseEvent) => {
    setMenuPosition({ x: undefined, y: undefined });
    event.stopPropagation();
    setMenuOpened(true);
  };

  const menuOnClose = () => {
    setMenuOpened(false);
  };

  const handleContextMenuClick = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
    setMenuOpened(true);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onItemDoubleClick?.();
    }
  };

  const onCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onActiveCloseClick?.();
  };

  return (
    <Menu
      width={152}
      onClose={menuOnClose}
      opened={menuOpened}
      disabled={disabled}
      position="bottom-start"
      arrowOffset={8}
    >
      <Menu.Dropdown style={menuStyles}>
        {menuItems.map((item, index) => {
          const isLast = index === menuItems.length - 1;
          return (
            <Fragment key={item.children.map((child) => child.label).join('')}>
              {item.children.map((child) => (
                <Menu.Item
                  key={child.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    child.onClick({ value: itemId, label, iconType });
                    menuOnClose();
                  }}
                >
                  {child.label}
                </Menu.Item>
              ))}
              {!isLast && <Menu.Divider />}
            </Fragment>
          );
        })}
      </Menu.Dropdown>

      <Group
        onClick={onClick}
        onContextMenu={handleContextMenuClick}
        onDoubleClick={handleDoubleClick}
        gap={5}
        wrap="nowrap"
        className={cn('cursor-pointer h-[30px] px-1 rounded group')}
      >
        {level !== 1 && <Divider orientation="vertical" />}
        {!active && (
          <div className="text-iconDefault-light dark:text-iconDefault-dark p-[1px]">
            <ListViewIcon iconType={iconType} size={16} />
          </div>
        )}
        {active && (
          <ActionIcon size={18} onClick={onCloseClick}>
            <IconX />
          </ActionIcon>
        )}

        <Text c="text-primary" className="text-sm px-1" lh="18px" truncate>
          {label}
        </Text>
        <Menu.Target>
          <ActionIcon
            onClick={handleContextMenu}
            className={cn('opacity-0 group-hover:opacity-100', menuOpened && 'opacity-100')}
            ml="auto"
            size={16}
          >
            <IconDotsVertical size={16} />
          </ActionIcon>
        </Menu.Target>
      </Group>
    </Menu>
  );
};

export const SourcesListView = <ItemID extends string = string>({
  list,
  disabled,
  activeItemKey,
  loading,
  menuItems,
  renameInputError,
  renameItemId,
  renameValue,
  isItemRenaming,
  onRenameChange,
  onItemRename,
  onRenameClose,
  onRenameSubmit,
  onDeleteSelected,
  parentDataTestId,
}: ListViewProps<ItemID>) => {
  /**
   * Common hooks
   */
  const tree = useTree();

  /**
   * Local state
   */
  const activeItemRef = useRef<HTMLDivElement>(null);
  const [isUserSelection, setIsUserSelection] = useState(false);

  /**
   * Consts
   */
  const sortedList = useMemo(
    () => [...list].sort((a, b) => a.label.localeCompare(b.label)),
    [list],
  );
  const hasData = !!sortedList.length;

  /**
   * Handlers
   */
  const handleDeselectAll = () => {
    tree.clearSelected();
  };

  const handleItemClick = (node: TypedTreeNodeData<ItemID>) => {
    const { onClick } = node.nodeProps || {};
    setIsUserSelection(true);
    onClick?.();
  };

  const handleListItemClick = (node: TypedTreeNodeData<ItemID>) => (e: React.MouseEvent) => {
    const { value } = node;
    const selected = tree.selectedState.includes(value);

    if (e.shiftKey) {
      if (tree.selectedState.length === 0) {
        handleItemClick(node);
        return;
      }
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      selected ? tree.deselect(value) : tree.setSelectedState([...tree.selectedState, value]);
      e.stopPropagation();
      return;
    }
    if (!disabled) {
      handleItemClick?.(node);
    }
  };

  const handleActiveCloseClick = (node: TypedTreeNodeData<ItemID>) => () => {
    const { onActiveClose } = node.nodeProps || {};
    onActiveClose?.();
  };

  const menuList: MenuItem<ItemID>[] = useMemo(() => {
    if (tree.selectedState.length > 1) {
      return [
        {
          children: [
            {
              label: 'Delete selected',
              onClick: () => {
                onDeleteSelected(tree.selectedState as ItemID[]);
                handleDeselectAll();
              },
            },
          ],
        },
      ];
    }
    return menuItems;
  }, [menuItems, tree.selectedState]);

  /**
   * Effects
   */
  useHotkeys([
    ['Escape', handleDeselectAll],
    [
      'mod+a',
      () => {
        if (activeItemKey && tree.selectedState.includes(activeItemKey)) {
          tree.setSelectedState(sortedList.map((item) => item.value));
        }
      },
    ],
    [
      'mod+Backspace',
      () => {
        if (!tree.selectedState.length) return;
        onDeleteSelected(tree.selectedState as ItemID[]);
        handleDeselectAll();
      },
    ],
  ]);

  // hack to set initial expanded state
  useDidUpdate(() => {
    if (Object.keys(tree.expandedState).length === 0) {
      tree.setExpandedState(getTreeExpandedState(sortedList, '*'));
    }
  }, [sortedList]);

  useEffect(() => {
    if (activeItemRef.current && !isUserSelection) {
      const itemElement = activeItemRef.current;
      const container = itemElement.parentElement;

      if (container) {
        const itemRect = itemElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const isItemHidden =
          itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom;

        if (isItemHidden) {
          itemElement.scrollIntoView({
            block: 'nearest',
          });
        }
      }
    }
    setIsUserSelection(false);
  }, [activeItemKey]);

  return (
    <Stack gap={0} className={cn('h-[calc(100%-50px)]')}>
      <Stack gap={0} className="overflow-y-scroll custom-scroll-hidden px-2 pb-1 h-full">
        {loading ? (
          <Stack gap={6} className="px-3 py-1.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={13} width={Math.random() * 100 + 70} />
            ))}
          </Stack>
        ) : (
          <>
            {!hasData ? (
              <Group justify="center" className="px-3 pt-2">
                <Text c="text-secondary">No data to display</Text>
              </Group>
            ) : (
              <Tree
                id={parentDataTestId}
                data={sortedList}
                tree={tree}
                selectOnClick
                clearSelectionOnOutsideClick
                renderNode={(payload) => {
                  const { elementProps, selected, node: payloadNode, level } = payload;
                  const node = payloadNode as TypedTreeNodeData<ItemID>;

                  const active = elementProps['data-value'] === activeItemKey;
                  const isRenaming = isItemRenaming && elementProps['data-value'] === renameItemId;
                  const currentIndex = sortedList.findIndex((item) => item.value === node.value);

                  const isPrevSelected = tree.selectedState.includes(
                    sortedList[currentIndex - 1]?.value,
                  );
                  const isNextSelected = tree.selectedState.includes(
                    sortedList[currentIndex + 1]?.value,
                  );

                  const isPrevActive =
                    currentIndex > 0 && sortedList[currentIndex - 1].value === activeItemKey;
                  const isNextActive =
                    currentIndex < sortedList.length - 1 &&
                    sortedList[currentIndex + 1].value === activeItemKey;

                  return (
                    <div
                      {...elementProps}
                      data-testid={setDataTestId(`query-list-item-${node.value}`)}
                      className={cn(
                        elementProps.className,
                        itemClasses.base,

                        disabled && itemClasses.disabled,
                        !disabled && itemClasses.hover.default,
                        (active || selected) && [
                          itemClasses.transparent008,
                          itemClasses.hover.active,
                        ],
                        (isPrevSelected || isPrevActive) && 'rounded-t-none',
                        (isNextSelected || isNextActive) && 'rounded-b-none',
                      )}
                    >
                      {isRenaming ? (
                        <>
                          <Popover opened={!!renameInputError}>
                            <Popover.Target>
                              <TextInput
                                data-testid={setDataTestId(
                                  `query-list-item-${node.value}-rename-input`,
                                )}
                                value={renameValue}
                                onChange={onRenameChange}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  event.key === 'Enter' && !renameInputError && onRenameSubmit?.();
                                  event.key === 'Escape' && onRenameClose?.();
                                }}
                                error={!!renameInputError}
                                onBlur={!renameInputError ? onRenameSubmit : onRenameClose}
                                fw={500}
                                classNames={{
                                  input: 'px-3 py-1',
                                }}
                                size="xs"
                                autoFocus
                              />
                            </Popover.Target>
                            <Popover.Dropdown>{renameInputError}</Popover.Dropdown>
                          </Popover>
                        </>
                      ) : (
                        <ListItem
                          label={node.label as string}
                          itemId={elementProps['data-value'] as ItemID}
                          active={active}
                          disabled={disabled}
                          menuItems={menuList}
                          node={node}
                          iconType={node.iconType}
                          level={level}
                          onClick={handleListItemClick(node)}
                          onActiveCloseClick={handleActiveCloseClick(node)}
                          onItemDoubleClick={() => onItemRename?.(node.value)}
                        />
                      )}
                    </div>
                  );
                }}
              />
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
};
