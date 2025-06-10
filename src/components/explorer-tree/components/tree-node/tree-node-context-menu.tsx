import { Menu } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';
import { Fragment } from 'react';

import { TreeNodeData, TreeNodeMenuType } from '../../model';
import { getMenuItemDataTestId } from '../../utils/context-menu';
import { TreeNodeMenuItem } from '../tree-menu-item';

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
  const menuStyles =
    menuPosition.x && menuPosition.y
      ? {
          top: menuPosition.y + 15,
          left: menuPosition.x - 10,
        }
      : undefined;

  return (
    <Menu
      width={152}
      onClose={onClose}
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
              ))}
              {!isLast && <Menu.Divider />}
            </Fragment>
          );
        })}
      </Menu.Dropdown>
      {children}
    </Menu>
  );
}
