import { useModifierContext } from '@components/modifier-context/modifier-context';
import { Menu, RenderTreeNodePayload as MantineRenderTreeNodePayload } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import React, { useMemo } from 'react';

import { TreeNodeMenuItemType, TreeNodeData } from '../model';

const MAX_SUBMENU_DEPTH = 5;
const SUBMENU_OFFSET = 4;
const SUBMENU_OPEN_DELAY = 0;
const SUBMENU_CLOSE_DELAY = 0;

function getMenuItemDisabled<NTypeToIdTypeMap extends Record<string, any>>(
  menuItem: TreeNodeMenuItemType<TreeNodeData<NTypeToIdTypeMap>>,
  node: TreeNodeData<NTypeToIdTypeMap>,
  tree: MantineRenderTreeNodePayload['tree'],
): boolean {
  return typeof menuItem.isDisabled === 'function'
    ? menuItem.isDisabled(node, tree)
    : Boolean(menuItem.isDisabled);
}

function hasValidSubmenu<NTypeToIdTypeMap extends Record<string, any>>(
  menuItem: TreeNodeMenuItemType<TreeNodeData<NTypeToIdTypeMap>>,
): boolean {
  return Boolean(menuItem.submenu && menuItem.submenu.length > 0);
}

function hasRenderableSubmenuItems(submenuItems: React.JSX.Element[] | null): boolean {
  return submenuItems !== null && submenuItems.length > 0;
}

export function TreeNodeMenuItem<NTypeToIdTypeMap extends Record<string, any>>({
  menuItem,
  node,
  tree,
  menuOnClose,
  dataTestId,
  currentDepth = 0,
}: {
  menuItem: TreeNodeMenuItemType<TreeNodeData<NTypeToIdTypeMap>>;
  node: TreeNodeData<NTypeToIdTypeMap>;
  tree: MantineRenderTreeNodePayload['tree'];
  menuOnClose: () => void;
  dataTestId: string | undefined;
  currentDepth?: number;
}) {
  const modifiers = useModifierContext();

  // Memoize submenu items computation
  const submenuItems = useMemo(() => {
    if (!menuItem.submenu || menuItem.submenu.length === 0) {
      return null;
    }

    const items = menuItem.submenu.flatMap((subItem, index) => {
      const element = (
        <TreeNodeMenuItem
          key={`${subItem.label}-${index}`}
          menuItem={subItem}
          node={node}
          tree={tree}
          menuOnClose={menuOnClose}
          dataTestId={dataTestId ? `${dataTestId}-submenu-${index}` : undefined}
          currentDepth={currentDepth + 1}
        />
      );
      return element ? [element] : [];
    });

    return items.length > 0 ? items : null;
  }, [menuItem.submenu, node, tree, menuOnClose, dataTestId, currentDepth]);

  const isHidden = menuItem.isHidden ? menuItem.isHidden(node, tree) : false;

  if (isHidden) {
    return null;
  }

  // Prevent infinite recursion by limiting submenu depth
  if (currentDepth >= MAX_SUBMENU_DEPTH) {
    return null;
  }

  const label = menuItem.onAlt && modifiers.alt ? menuItem.onAlt.label : menuItem.label;
  const onClick = menuItem.onAlt && modifiers.alt ? menuItem.onAlt.onClick : menuItem.onClick;
  const isDisabled = getMenuItemDisabled(menuItem, node, tree);

  if (hasValidSubmenu(menuItem)) {
    if (!hasRenderableSubmenuItems(submenuItems)) {
      return null;
    }

    return (
      <Menu
        trigger="hover"
        withinPortal={false}
        position="right-start"
        offset={SUBMENU_OFFSET}
        openDelay={SUBMENU_OPEN_DELAY}
        closeDelay={SUBMENU_CLOSE_DELAY}
        closeOnItemClick={false}
      >
        <Menu.Target>
          <Menu.Item
            key={menuItem.label}
            disabled={isDisabled}
            data-testid={dataTestId}
            rightSection={<IconChevronRight size={14} />}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {label}
          </Menu.Item>
        </Menu.Target>
        <Menu.Dropdown>{submenuItems}</Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <Menu.Item
      key={menuItem.label}
      disabled={isDisabled}
      data-testid={dataTestId}
      onClick={(e) => {
        onClick(node, tree);
        menuOnClose();
        e.stopPropagation();
      }}
    >
      {label}
    </Menu.Item>
  );
}
