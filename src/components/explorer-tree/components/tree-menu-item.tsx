import { useModifierContext } from '@components/modifier-context/modifier-context';
import { Menu, RenderTreeNodePayload as MantineRenderTreeNodePayload } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { memo, useMemo } from 'react';

import { TreeNodeMenuItemType, TreeNodeData } from '../model';

function TreeNodeMenuItemComponent<NTypeToIdTypeMap extends Record<string, any>>({
  menuItem,
  node,
  tree,
  menuOnClose,
  dataTestId,
}: {
  menuItem: TreeNodeMenuItemType<TreeNodeData<NTypeToIdTypeMap>>;
  node: TreeNodeData<NTypeToIdTypeMap>;
  tree: MantineRenderTreeNodePayload['tree'];
  menuOnClose: () => void;
  dataTestId: string | undefined;
}) {
  const modifiers = useModifierContext();

  // Memoize label and onClick based on modifier state
  const label = useMemo(
    () => (menuItem.onAlt && modifiers.alt ? menuItem.onAlt.label : menuItem.label),
    [menuItem.label, menuItem.onAlt, modifiers.alt],
  );

  const onClick = useMemo(
    () => (menuItem.onAlt && modifiers.alt ? menuItem.onAlt.onClick : menuItem.onClick),
    [menuItem.onClick, menuItem.onAlt, modifiers.alt],
  );

  if (menuItem.children && menuItem.children.length > 0) {
    return (
      <Menu
        withinPortal={false}
        trigger="hover"
        openDelay={100}
        closeDelay={100}
        position="right-start"
        offset={4}
        keepMounted
      >
        <Menu.Target>
          <Menu.Item
            key={menuItem.label}
            disabled={menuItem.isDisabled}
            data-testid={dataTestId}
            rightSection={<IconChevronRight size={12} />}
            onClick={(e) => {
              e.stopPropagation();
            }}
            role="menuitem"
            aria-haspopup="menu"
          >
            {label}
          </Menu.Item>
        </Menu.Target>
        <Menu.Dropdown role="menu">
          {menuItem.children.map((child, index) => (
            <TreeNodeMenuItem
              key={child.label}
              menuItem={child}
              node={node}
              tree={tree}
              menuOnClose={menuOnClose}
              dataTestId={dataTestId ? `${dataTestId}-submenu-${index}` : undefined}
            />
          ))}
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <Menu.Item
      key={menuItem.label}
      disabled={menuItem.isDisabled}
      data-testid={dataTestId}
      onClick={(e) => {
        onClick(node, tree);
        menuOnClose();
        e.stopPropagation();
      }}
      role="menuitem"
    >
      {label}
    </Menu.Item>
  );
}

// Memoize the component to prevent unnecessary re-renders in nested menus
export const TreeNodeMenuItem = memo(TreeNodeMenuItemComponent) as typeof TreeNodeMenuItemComponent;
