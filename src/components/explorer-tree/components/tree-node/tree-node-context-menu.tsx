import { Menu } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';
import { Fragment, useMemo } from 'react';

import { TreeNodeData, TreeNodeMenuType } from '../../model';
import { getMenuItemDataTestId } from '../../utils/context-menu';
import { filterVisibleMenuItems } from '../../utils/menu-filtering';
import { TreeNodeMenuItem } from '../tree-menu-item';

const CONTEXT_MENU_WIDTH = 152;
const CONTEXT_MENU_ARROW_OFFSET = 8;
const CONTEXT_MENU_CLOSE_DELAY = 0;
const CONTEXT_MENU_TOP_OFFSET = 15;
const CONTEXT_MENU_LEFT_OFFSET = -10;

interface TreeNodeContextMenuProps<NTypeToIdTypeMap extends Record<string, any>> {
  menuOpened: boolean;
  menuPosition: { x: number | undefined; y: number | undefined };
  contextMenu: TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>>;
  isDisabled?: boolean;
  node: TreeNodeData<NTypeToIdTypeMap>;
  tree: any;
  treeNodeDataTestIdPrefix: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function TreeNodeContextMenu<NTypeToIdTypeMap extends Record<string, any>>({
  menuOpened,
  menuPosition,
  contextMenu,
  isDisabled,
  node,
  tree,
  treeNodeDataTestIdPrefix,
  onClose,
  children,
}: TreeNodeContextMenuProps<NTypeToIdTypeMap>) {
  const menuStyles = useMemo(
    () =>
      menuPosition.x && menuPosition.y
        ? {
            top: menuPosition.y + CONTEXT_MENU_TOP_OFFSET,
            left: menuPosition.x + CONTEXT_MENU_LEFT_OFFSET,
          }
        : undefined,
    [menuPosition.x, menuPosition.y],
  );

  const processedMenuSections = useMemo(
    () =>
      contextMenu
        .map((item) => {
          const visibleChildren = filterVisibleMenuItems(item.children, node, tree);

          if (visibleChildren.length === 0) {
            return null;
          }

          return { ...item, children: visibleChildren } as typeof item;
        })
        .filter(
          (item): item is TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>>[number] => item !== null,
        ),
    [contextMenu, node, tree],
  );

  return (
    <Menu
      width={CONTEXT_MENU_WIDTH}
      onClose={onClose}
      opened={menuOpened}
      disabled={isDisabled}
      position="bottom-start"
      arrowOffset={CONTEXT_MENU_ARROW_OFFSET}
      withinPortal={false}
      floatingStrategy="fixed"
      closeDelay={CONTEXT_MENU_CLOSE_DELAY}
      data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-dots-menu-button`)}
    >
      <Menu.Dropdown
        style={menuStyles}
        data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-context-menu`)}
      >
        {processedMenuSections
          .map((item, index, array) => {
            const renderedChildren = item.children.flatMap((menuItem, menuItemIndex) => {
              const element = (
                <TreeNodeMenuItem
                  key={`${menuItem.label}-${index}-${menuItemIndex}`}
                  menuItem={menuItem}
                  node={node}
                  tree={tree}
                  menuOnClose={onClose}
                  dataTestId={setDataTestId(
                    getMenuItemDataTestId(
                      treeNodeDataTestIdPrefix,
                      menuItem.label,
                      index,
                      menuItemIndex,
                    ),
                  )}
                />
              );
              return element ? [element] : [];
            });

            if (renderedChildren.length === 0) {
              return null;
            }

            const isLast = index === array.length - 1;

            return (
              <Fragment key={item.children.map((child) => child.label).join('|')}>
                {renderedChildren}
                {!isLast && <Menu.Divider />}
              </Fragment>
            );
          })
          .filter(Boolean)}
      </Menu.Dropdown>
      {children}
    </Menu>
  );
}
