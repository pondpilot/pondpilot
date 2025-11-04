import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { memo, useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';

import { BaseTreeNodeProps } from '../model';
import { getNodeDataTestIdPrefix } from '../utils/node-test-id';
import { sanitizeHTMLProps } from '../utils/sanitize-props';
import {
  TreeNodeRenameInput,
  TreeNodeContextMenu,
  TreeNodeContent,
  useTreeNodeRename,
  useTreeNodeContextMenu,
} from './tree-node/index';

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

const BaseTreeNode = <NTypeToIdTypeMap extends Record<string, any>>({
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
    isDisabled,
    isSelectable,
    onNodeClick,
    renameCallbacks,
    onCloseItemClick,
    tooltip,
  } = node;

  const curNodeIndex = flattenedNodeIds.indexOf(itemId);
  const isPrevSelected =
    curNodeIndex > 0 ? tree.selectedState.includes(flattenedNodeIds[curNodeIndex - 1]) : false;
  const isNextSelected =
    curNodeIndex < flattenedNodeIds.length - 1
      ? tree.selectedState.includes(flattenedNodeIds[curNodeIndex + 1])
      : false;

  const treeNodeDataTestIdPrefix = getNodeDataTestIdPrefix(dataTestIdPrefix, itemId);

  // Use rename hook
  const {
    isRenaming,
    pendingRenamedValue,
    renameInputError,
    handleStartRename,
    handleOnRenameChange,
    handleRenameCancel,
    handleRenameKeyDown,
  } = useTreeNodeRename(node, renameCallbacks);

  // Use context menu hook
  const {
    menuOpened,
    menuPosition,
    contextMenu,
    handleOpenMenuButton,
    handleCloseMenu,
    handleContextMenuClick,
  } = useTreeNodeContextMenu(node, renameCallbacks, overrideContextMenu, handleStartRename);

  // Selection tracking for scroll behavior
  const [isUserSelection, setIsUserSelection] = useState(false);

  const handleCloseItemClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCloseItemClick) {
      onCloseItemClick(node);
    }
    tree.deselect(itemId);
  };

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isDisabled) return;

    // Handle Alt/Option key for toggling expansion
    if (e.altKey) {
      if (hasChildren && (node.doNotExpandOnClick !== true || node.nodeType === 'file')) {
        tree.toggleExpanded(itemId);
      }
      if (isSelectable) {
        tree.select(itemId);
        setIsUserSelection(true);
      }
      onNodeClick?.(node, tree);
      nodeRef.current?.focus();
      return;
    }

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
        // First shift+click sets the anchor
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
  }, [isActive, isUserSelection, itemId, selected, tree]);

  // Sanitize node.elementProps to prevent XSS from untrusted props
  const sanitizedNodeProps = sanitizeHTMLProps(node.elementProps ?? {});
  const mergedElementProps = {
    ...elementProps,
    ...sanitizedNodeProps,
  };
  const {
    className: elementClassName,
    draggable,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnter,
    ...restElementProps
  } = mergedElementProps;

  const normalizedDraggable = typeof draggable === 'string' ? draggable === 'true' : draggable;

  return (
    <div
      {...restElementProps}
      draggable={normalizedDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnter={onDragEnter}
      data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-container`)}
      data-selected={selected}
      className={cn(
        elementClassName,
        ITEM_CLASSES.base,
        isDisabled ? ITEM_CLASSES.disabled : ITEM_CLASSES.hover.default,
        (isActive || selected) && [ITEM_CLASSES.transparent008, ITEM_CLASSES.hover.active],
        (isPrevSelected || isPrevActive) && 'rounded-t-none',
        (isNextSelected || isNextActive) && 'rounded-b-none',
      )}
    >
      {isRenaming ? (
        <TreeNodeRenameInput
          pendingRenamedValue={pendingRenamedValue}
          renameInputError={renameInputError}
          treeNodeDataTestIdPrefix={treeNodeDataTestIdPrefix}
          node={node}
          validateRename={renameCallbacks?.validateRename || (() => null)}
          onRenameChange={handleOnRenameChange}
          onRenameKeyDown={handleRenameKeyDown}
          onRenameCancel={handleRenameCancel}
        />
      ) : contextMenu.length > 0 ? (
        <TreeNodeContextMenu
          menuOpened={menuOpened}
          menuPosition={menuPosition}
          contextMenu={contextMenu}
          isDisabled={isDisabled}
          node={node}
          tree={tree}
          treeNodeDataTestIdPrefix={treeNodeDataTestIdPrefix}
          onClose={handleCloseMenu}
        >
          <TreeNodeContent
            level={level}
            node={node}
            isActive={isActive}
            menuOpened={menuOpened}
            tooltip={tooltip}
            hasContextMenu
            nodeRef={nodeRef}
            onNodeClick={handleNodeClick}
            onContextMenuClick={handleContextMenuClick}
            onStartRename={handleStartRename}
            onCloseItemClick={handleCloseItemClick}
            onOpenMenuButton={handleOpenMenuButton}
          />
        </TreeNodeContextMenu>
      ) : (
        <TreeNodeContent
          level={level}
          node={node}
          isActive={isActive}
          menuOpened={false}
          tooltip={tooltip}
          hasContextMenu={false}
          nodeRef={nodeRef}
          onNodeClick={handleNodeClick}
          onContextMenuClick={contextMenu.length > 0 ? handleContextMenuClick : undefined}
          onStartRename={handleStartRename}
          onCloseItemClick={handleCloseItemClick}
        />
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
