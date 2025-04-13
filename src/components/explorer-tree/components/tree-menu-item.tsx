import { Menu, RenderTreeNodePayload as MantineRenderTreeNodePayload } from '@mantine/core';
import { useModifierContext } from '@components/modifier-context/modifier-context';
import { TreeNodeMenuItemType, TreeNodeData } from '../model';

export function TreeNodeMenuItem<NTypeToIdTypeMap extends Record<string, string>>({
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

  const label = menuItem.onAlt && modifiers.alt ? menuItem.onAlt.label : menuItem.label;

  const onClick = menuItem.onAlt && modifiers.alt ? menuItem.onAlt.onClick : menuItem.onClick;

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
    >
      {label}
    </Menu.Item>
  );
}
