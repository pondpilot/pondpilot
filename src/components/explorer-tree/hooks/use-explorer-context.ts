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
  extraData?: ExtraData;
  buildMultiSelectMenu?: (params: {
    selectedNodes: TreeNodeData<NTypeToIdTypeMap>[];
    selectedState: string[];
  }) => TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> | null | undefined;
}

export function useExplorerContext<
  NTypeToIdTypeMap extends Record<string, any>,
  ExtraData extends Record<string, any> = {},
>(options: UseExplorerContextOptions<NTypeToIdTypeMap, ExtraData>) {
  const {
    nodes,
    handleDeleteSelected,
    getShowSchemaHandler,
    buildMultiSelectMenu,
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

      const multiSelectMenu = createMultiSelectContextMenu<NTypeToIdTypeMap>(
        selectedState,
        flattenedNodes,
        {
          onDeleteSelected: handleDeleteSelected,
          onShowSchemaSelected: showSchemaHandler,
        },
      ) as TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> | null;

      const customMenu = buildMultiSelectMenu?.({
        selectedNodes: selectedNodes as TreeNodeData<NTypeToIdTypeMap>[],
        selectedState,
      });

      if (customMenu && customMenu.length > 0) {
        if (!multiSelectMenu) {
          return customMenu;
        }
        return [...multiSelectMenu, ...customMenu];
      }

      return multiSelectMenu;
    },
    [flattenedNodes, handleDeleteSelected, getShowSchemaHandler, buildMultiSelectMenu],
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
