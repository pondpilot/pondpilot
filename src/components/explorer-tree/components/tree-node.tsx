import { TextInput, Popover, ActionIcon, Menu, Text, Divider, Group } from '@mantine/core';
import { IconDotsVertical, IconX } from '@tabler/icons-react';
import { Fragment, memo, useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';

import { TreeNodeMenuType, TreeNodeData, BaseTreeNodeProps } from '@components/explorer-tree/model';
import { getMenuItemDataTestId, mergeMenus } from '@components/explorer-tree/utils/context-menu';
import { getNodeDataTestIdPrefix } from '@components/explorer-tree/utils/node-test-id';
import { NamedIcon } from '@components/named-icon';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

import { TreeNodeMenuItem } from './tree-menu-item';

const ITEM_CLASSES = {
  base: 'cursor-pointer h-[30px] rounded group bg-transparent !outline-none',
  disabled: 'opacity-50 cursor-default',
  transparent004: 'bg-transparent004-light dark:bg-transparent004-dark',
  transparent008: 'bg-transparent008-light dark:bg-transparent008-dark',
  hover: {
    default: 'hover:bg-transparent004-light dark:hover:bg-transparent004-dark',
    active: 'hover:bg-transparent008-light dark:hover:bg-transparent008-dark',
  },
};

type RenameState = {
  isRenaming: boolean;
  pendingRenamedValue: string;
  renameInputError: string | null;
};

export const BaseTreeNode = <NTypeToIdTypeMap extends Record<string, any>>({
  level,
  node,
  hasChildren,
  elementProps,
  selected,
  tree,
  isActive,
  isPrevActive,
  isNextActive,
  dataTestIdPrefix,
  overrideContextMenu,
  flattenedNodeIds,
}: BaseTreeNodeProps<NTypeToIdTypeMap>) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  const {
    value: itemId,
    iconType,
    label,
    isDisabled,
    isSelectable,
    onNodeClick,
    renameCallbacks,
    onDelete,
    onCloseItemClick,
    contextMenu: customContextMenu,
  } = node;

  const curNodeIndex = flattenedNodeIds.indexOf(itemId);
  const isPrevSelected =
    curNodeIndex > 0 ? tree.selectedState.includes(flattenedNodeIds[curNodeIndex - 1]) : false;
  const isNextSelected =
    curNodeIndex < flattenedNodeIds.length - 1
      ? tree.selectedState.includes(flattenedNodeIds[curNodeIndex + 1])
      : false;

  const treeNodeDataTestIdPrefix = getNodeDataTestIdPrefix(dataTestIdPrefix, itemId);

  /*
   * Renaming logic
   */
  const { validateRename, onRenameSubmit, prepareRenameValue } = renameCallbacks || {};
  const [{ isRenaming, pendingRenamedValue, renameInputError }, setRenaming] =
    useState<RenameState>({
      isRenaming: false,
      pendingRenamedValue: label,
      renameInputError: null,
    });

  const handleStartRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Check if the item is not disabled, not renaming already, and if the rename callbacks are present
    if (!isDisabled && !isRenaming && validateRename && onRenameSubmit) {
      setRenaming({
        isRenaming: true,
        pendingRenamedValue: prepareRenameValue?.(node) || label,
        renameInputError: null,
      });
    }
  };

  const handleOnRenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRenaming({
      isRenaming: true,
      pendingRenamedValue: e.currentTarget.value,
      // Null assertion is safe because we are checking if validateRename is present before rendering
      // components that call this handler
      renameInputError: validateRename!(node, e.currentTarget.value),
    });
  };

  const handleRenameCancel = () => {
    setRenaming({ isRenaming: false, pendingRenamedValue: label, renameInputError: null });
  };

  const handleRenameSubmit = () => {
    // Double check if the name is valid
    // Null assertion is safe because we are checking if validateRename is present before rendering
    // components that call this handler
    if (validateRename!(node, pendingRenamedValue) === null) {
      setRenaming({ isRenaming: false, pendingRenamedValue, renameInputError: null });
      onRenameSubmit!(node, pendingRenamedValue);
      return;
    }

    // If we made a mistake and called this with an invalid name,
    // handle as if the user cancelled the rename
    handleRenameCancel();
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !renameInputError) {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  };

  /*
   * Item click handlers
   */

  /**
   * Needs to detect the change of the active element from outside, to scroll it into the visible area, but avoid scrolling if the user clicked on the list
   */
  const [isUserSelection, setIsUserSelection] = useState(false);

  const handleCloseItemClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Null assertion is safe because we are checking if onCloseItemClick is present before rendering
    // components that call this handler
    onCloseItemClick!(node);
    tree.deselect(itemId);
  };

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isDisabled) return;

    // Handle Shift key selection (range selection)
    if (e.shiftKey) {
      if (tree.anchorNode) {
        const anchorIndex = flattenedNodeIds.indexOf(
          tree.anchorNode as NTypeToIdTypeMap[keyof NTypeToIdTypeMap],
        );
        const start = Math.min(anchorIndex, curNodeIndex);
        const end = Math.max(anchorIndex, curNodeIndex);
        tree.setSelectedState(flattenedNodeIds.slice(start, end + 1));
        nodeRef.current?.focus();
      } else {
        hasChildren && tree.toggleExpanded(itemId);
        if (isSelectable) {
          tree.select(itemId);
          setIsUserSelection(true);
        }
        onNodeClick?.(node, tree);
        nodeRef.current?.focus();
      }
      return;
    }

    // Handle Ctrl/Cmd key selection (toggle selection)
    if (e.metaKey || e.ctrlKey) {
      if (selected) {
        tree.deselect(itemId);
      } else {
        tree.setSelectedState([...tree.selectedState, itemId]);
      }
      return;
    }

    // Handle regular selection
    if (isSelectable) {
      tree.select(itemId);
      setIsUserSelection(true);
    }
    hasChildren && node.doNotExpandOnClick !== true && tree.toggleExpanded(itemId);
    onNodeClick?.(node, tree);
  };

  useEffect(() => {
    if (nodeRef.current && !isUserSelection && isActive) {
      const itemElement = nodeRef.current;
      const container = itemElement.parentElement?.parentElement?.parentElement?.parentElement;

      if (container) {
        const itemRect = itemElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const isItemHidden =
          itemRect.bottom < containerRect.top || itemRect.top > containerRect.bottom;

        if (isItemHidden) {
          itemElement.scrollIntoView({
            block: 'nearest',
          });
        }
      }

      // Also, if this node became active but is not selected - we need to
      // clear the selection and change the focus to this node
      if (!selected) {
        tree.clearSelected();
        tree.select(itemId);
      }
    }
    setIsUserSelection(false);
  }, [isActive]);

  /*
   * Construct menu items
   */
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

  const defaultMenu: TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> = [];

  defaultMenu.push({
    children: [
      {
        label: 'Rename',
        onClick: () => handleStartRename(),
        isDisabled: isDisabled || !renameCallbacks,
      },
    ],
  });

  defaultMenu.push({
    children: [
      {
        label: 'Delete',
        onClick: () => onDelete?.(node),
        isDisabled: isDisabled || !onDelete,
      },
    ],
  });

  const contextMenu = overrideContextMenu || mergeMenus([customContextMenu, defaultMenu]);

  const handleOpenMenuButton = (event: React.MouseEvent) => {
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

  return (
    <div
      {...elementProps}
      data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-container`)}
      data-selected={selected}
      className={cn(
        elementProps.className,
        ITEM_CLASSES.base,

        isDisabled ? ITEM_CLASSES.disabled : ITEM_CLASSES.hover.default,
        (isActive || selected) && [ITEM_CLASSES.transparent008, ITEM_CLASSES.hover.active],
        (isPrevSelected || isPrevActive) && 'rounded-t-none',
        (isNextSelected || isNextActive) && 'rounded-b-none',
      )}
    >
      {isRenaming ? (
        <>
          <Popover opened={!!renameInputError}>
            <Popover.Target>
              <TextInput
                data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-rename-input`)}
                value={pendingRenamedValue}
                onChange={handleOnRenameChange}
                onKeyDown={handleRenameKeyDown}
                error={!!renameInputError}
                onBlur={handleRenameCancel}
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
        <Menu
          width={152}
          onClose={menuOnClose}
          opened={menuOpened}
          disabled={isDisabled}
          position="bottom-start"
          arrowOffset={8}
          withinPortal={false}
          floatingStrategy="fixed"
          closeDelay={0}
          data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-dots-menu-button`)}
        >
          <Menu.Dropdown
            style={menuStyles}
            data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-context-menu`)}
          >
            {contextMenu.map((item, index) => {
              const isLast = index === contextMenu.length - 1;
              return (
                <Fragment key={item.children.map((child) => child.label).join('|')}>
                  {item.children.map((menuItem, menuItemIndex) => (
                    <TreeNodeMenuItem
                      key={menuItem.label}
                      menuItem={menuItem}
                      node={node}
                      tree={tree}
                      menuOnClose={menuOnClose}
                      dataTestId={setDataTestId(
                        getMenuItemDataTestId(
                          treeNodeDataTestIdPrefix,
                          menuItem.label,
                          index,
                          menuItemIndex,
                        ),
                      )}
                    />
                  ))}
                  {!isLast && <Menu.Divider />}
                </Fragment>
              );
            })}
          </Menu.Dropdown>

          <Group
            // This will effectively override the default Mantine `onClick`
            // which is still applied from `...elementProps` on the top most div
            onClick={handleNodeClick}
            onContextMenu={handleContextMenuClick}
            onDoubleClick={handleStartRename}
            gap={5}
            wrap="nowrap"
            className={cn('cursor-pointer h-[30px] px-1 rounded group')}
            ref={nodeRef}
          >
            {level !== 1 && <Divider orientation="vertical" />}
            {isActive && onCloseItemClick ? (
              <ActionIcon size={18} onClick={handleCloseItemClick}>
                <IconX />
              </ActionIcon>
            ) : (
              <div className="text-iconDefault-light dark:text-iconDefault-dark p-[1px]">
                <NamedIcon iconType={iconType} size={16} />
              </div>
            )}

            <Text c="text-primary" className="text-sm px-1" lh="18px" truncate>
              {label}
            </Text>
            <Menu.Target>
              <ActionIcon
                onClick={handleOpenMenuButton}
                className={cn('opacity-0 group-hover:opacity-100', menuOpened && 'opacity-100')}
                ml="auto"
                size={16}
              >
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
          </Group>
        </Menu>
      )}
    </div>
  );
};

// The way this function is implemented (verbose) is to allow easy
// debugging when necessary (see commented out logging code at the bottom).
// When stable, we can remove the `comparisons` array and just do straight
// compare and return
function arePropsEqual<NTypeToIdTypeMap extends Record<string, any>>(
  oldProps: BaseTreeNodeProps<NTypeToIdTypeMap>,
  newProps: BaseTreeNodeProps<NTypeToIdTypeMap>,
): boolean {
  return (
    oldProps.level === newProps.level &&
    oldProps.expanded === newProps.expanded &&
    oldProps.hasChildren === newProps.hasChildren &&
    oldProps.selected === newProps.selected &&
    Object.is(oldProps.node, newProps.node) &&
    oldProps.elementProps.className === newProps.elementProps.className &&
    shallow(oldProps.elementProps.style, newProps.elementProps.style) &&
    oldProps.elementProps['data-selected'] === newProps.elementProps['data-selected'] &&
    oldProps.elementProps['data-value'] === newProps.elementProps['data-value'] &&
    oldProps.elementProps['data-hovered'] === newProps.elementProps['data-hovered'] &&
    oldProps.isActive === newProps.isActive &&
    oldProps.isPrevActive === newProps.isPrevActive &&
    oldProps.isNextActive === newProps.isNextActive &&
    oldProps.dataTestIdPrefix === newProps.dataTestIdPrefix &&
    Object.is(oldProps.overrideContextMenu, newProps.overrideContextMenu) &&
    Object.is(oldProps.flattenedNodeIds, newProps.flattenedNodeIds)
  );
}

export const MemoizedBaseTreeNode = memo(BaseTreeNode, arePropsEqual) as typeof BaseTreeNode;
