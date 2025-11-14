import { RenderTreeNodePayload as MantineRenderTreeNodePayload } from '@mantine/core';

import { TreeNodeData, TreeNodeMenuItemType } from '../model';

/**
 * Filters out hidden menu items from a list of menu items.
 */
export function filterVisibleMenuItems<NTypeToIdTypeMap extends Record<string, any>>(
  items: TreeNodeMenuItemType<TreeNodeData<NTypeToIdTypeMap>>[],
  node: TreeNodeData<NTypeToIdTypeMap>,
  tree: MantineRenderTreeNodePayload['tree'],
): TreeNodeMenuItemType<TreeNodeData<NTypeToIdTypeMap>>[] {
  return items.filter((item) => {
    if (typeof item.isHidden === 'function') {
      return !item.isHidden(node, tree);
    }
    return true;
  });
}
