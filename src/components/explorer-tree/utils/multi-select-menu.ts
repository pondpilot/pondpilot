import { TreeNodeData, TreeNodeMenuType } from '../model';

export type MultiSelectHandlers<NTypeToIdTypeMap extends Record<string, any>> = {
  /**
   * Handler for deleting selected items
   */
  onDeleteSelected?: (selectedIds: NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]) => void;

  /**
   * Handler for showing schema for selected items
   */
  onShowSchemaSelected?: (selectedIds: NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]) => void;
};

/**
 * Creates a context menu for multi-selected items in the explorer tree
 *
 * @param selectedState - Array of selected node IDs
 * @param flattenedNodes - All nodes in the tree (flattened)
 * @param handlers - Handlers for various multi-select actions
 * @returns Context menu for multi-select or null if not applicable
 */
export function createMultiSelectContextMenu<NTypeToIdTypeMap extends Record<string, any>>(
  selectedState: string[],
  flattenedNodes: TreeNodeData<NTypeToIdTypeMap>[],
  handlers: MultiSelectHandlers<NTypeToIdTypeMap>,
): TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> | null {
  // Only show multi-select menu if 2 or more items are selected
  if (selectedState.length < 2) {
    return null;
  }

  const selectedNodeIds = new Set(selectedState);
  const selectedNodes = flattenedNodes.filter((node) => selectedNodeIds.has(node.value as string));

  const menuItems: TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> = [];
  const menuSection: TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>>[0] = { children: [] };

  // Add delete option if handler exists and there are deleteable nodes
  if (handlers.onDeleteSelected) {
    const deleteableNodes = selectedNodes.filter((node) => !!node.onDelete);
    if (deleteableNodes.length > 0) {
      menuSection.children.push({
        label: 'Delete selected',
        isDisabled: false,
        onClick: () => {
          const deleteableIds = deleteableNodes.map((node) => node.value);
          handlers.onDeleteSelected!(deleteableIds);
        },
      });
    }
  }

  // Add show schema option if handler exists
  if (handlers.onShowSchemaSelected) {
    menuSection.children.push({
      label: 'Show Schema',
      isDisabled: false,
      onClick: () => {
        handlers.onShowSchemaSelected!(selectedState as NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]);
      },
    });
  }

  // Only return menu if we have items
  if (menuSection.children.length > 0) {
    menuItems.push(menuSection);
    return menuItems;
  }

  return null;
}

/**
 * Helper to get deleteable node IDs from selected state
 */
export function getSelectedDeleteableNodeIds<NTypeToIdTypeMap extends Record<string, any>>(
  selectedState: string[],
  flattenedNodes: TreeNodeData<NTypeToIdTypeMap>[],
): NTypeToIdTypeMap[keyof NTypeToIdTypeMap][] {
  const selectedNodeIds = new Set(selectedState);
  return flattenedNodes
    .filter((node) => selectedNodeIds.has(node.value as string) && !!node.onDelete)
    .map((node) => node.value);
}
