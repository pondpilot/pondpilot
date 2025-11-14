import { useMemo, useCallback } from 'react';

import { TreeNodeData, TreeNodeMenuType } from '../model';
import { useDeleteHotkey } from './use-delete-hotkey';
import { createMultiSelectContextMenu } from '../utils/multi-select-menu';
import { getFlattenNodes } from '../utils/tree-manipulation';

interface UseExplorerContextOptions<
  NTypeToIdTypeMap extends Record<string, any>,
  ExtraData extends Record<string, any> = {},
> {
  nodes: TreeNodeData<NTypeToIdTypeMap>[];
  handleDeleteSelected: (ids: NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]) => void;
  getShowSchemaHandler?: (
    selectedNodes: TreeNodeData<NTypeToIdTypeMap>[],
  ) => ((ids: NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]) => void) | undefined;
  getAdditionalMultiSelectMenu?: (
    selectedNodes: TreeNodeData<NTypeToIdTypeMap>[],
  ) => TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> | null;
  extraData?: ExtraData;
}

export function useExplorerContext<
  NTypeToIdTypeMap extends Record<string, any>,
  ExtraData extends Record<string, any> = {},
>(options: UseExplorerContextOptions<NTypeToIdTypeMap, ExtraData>) {
  const {
    nodes,
    handleDeleteSelected,
    getShowSchemaHandler,
    getAdditionalMultiSelectMenu,
    extraData = {} as ExtraData,
  } = options;

  // Common calculations
  const flattenedNodes = useMemo(() => getFlattenNodes<NTypeToIdTypeMap>(nodes), [nodes]);

  const flattenedNodeIds = useMemo(
    () => flattenedNodes.map((node) => node.value),
    [flattenedNodes],
  );

  const selectedDeleteableNodeIds = useMemo(
    () => flattenedNodes.filter((node) => !!node.onDelete).map((node) => node.value),
    [flattenedNodes],
  );

  // Create override context menu function
  const getOverrideContextMenu = useCallback(
    (selectedState: string[]) => {
      const selectedNodes = selectedState
        .map((nodeId) => flattenedNodes.find((node) => node.value === nodeId))
        .filter(Boolean);

      const showSchemaHandler = getShowSchemaHandler?.(
        selectedNodes as TreeNodeData<NTypeToIdTypeMap>[],
      );

      const baseMenu = createMultiSelectContextMenu<NTypeToIdTypeMap>(
        selectedState,
        flattenedNodes,
        {
          onDeleteSelected: handleDeleteSelected,
          onShowSchemaSelected: showSchemaHandler,
        },
      ) as TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> | null;

      const additionalMenu = getAdditionalMultiSelectMenu?.(
        selectedNodes as TreeNodeData<NTypeToIdTypeMap>[],
      );

      if (additionalMenu && additionalMenu.length > 0 && baseMenu && baseMenu.length > 0) {
        return [...additionalMenu, ...baseMenu];
      }

      if (additionalMenu && additionalMenu.length > 0) {
        return additionalMenu;
      }

      return baseMenu;
    },
    [flattenedNodes, handleDeleteSelected, getShowSchemaHandler, getAdditionalMultiSelectMenu],
  );

  // Set up delete hotkey
  useDeleteHotkey(selectedDeleteableNodeIds, handleDeleteSelected);

  // Return enhanced extra data
  return {
    ...extraData,
    getOverrideContextMenu,
    flattenedNodes,
    flattenedNodeIds,
    selectedDeleteableNodeIds,
  };
}
