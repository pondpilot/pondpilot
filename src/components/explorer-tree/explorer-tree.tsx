import {
  Stack,
  Group,
  Text,
  Tree,
  useTree,
  getTreeExpandedState,
  RenderTreeNodePayload as MantineRenderTreeNodePayload,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { ReactNode, useCallback, useMemo, useRef, useEffect } from 'react';

import { RenderTreeNodePayload, TreeNodeMenuType, TreeNodeData } from './model';
import { getFlattenNodes } from './utils/tree-manipulation';

type ExplorerTreeProps<NTypeToIdTypeMap extends Record<string, string>, ExtraT = undefined> = {
  /**
   * A sorted tree of nodes to be displayed
   */
  nodes: TreeNodeData<NTypeToIdTypeMap>[];

  /**
   * If set, will be used as initial expanded state of the tree. Otherwise
   * the entire tree will be expanded on mount.
   */
  initialExpandedState?: Record<NTypeToIdTypeMap[keyof NTypeToIdTypeMap], boolean>;

  /**
   * Used as the data-testid for the tree. The resulting data-testid:
   * `${dataTestIdPrefix}-tree`.
   */
  dataTestIdPrefix: string;

  /**
   * Custom component for tree nodes. Should wrap BaseTreeNode and provide context
   * aware state (see the difference between `RenderTreeNodePayload` vs. `BaseTreeNodeProps`)
   */
  TreeNodeComponent: React.ComponentType<RenderTreeNodePayload<NTypeToIdTypeMap, ExtraT>>;

  /**
   * Callback for multi-node deletion
   */
  onDeleteSelected: (ids: Iterable<NTypeToIdTypeMap[keyof NTypeToIdTypeMap]>) => void;

  /**
   * If set to false, the selection state will be cleared.
   */
  hasActiveElement: boolean;

  /**
   * Used to pass arbitrary extra data that is passed through to TreeNodeComponent
   * for rendering.
   */
  readonly extraData: ExtraT;
};

export const ExplorerTree = <NTypeToIdTypeMap extends Record<string, string>, ExtraT = undefined>({
  nodes,
  initialExpandedState,
  dataTestIdPrefix,
  TreeNodeComponent,
  onDeleteSelected,
  extraData,
  hasActiveElement,
}: ExplorerTreeProps<NTypeToIdTypeMap, ExtraT>) => {
  /**
   * Common hooks
   */
  const tree = useTree({
    initialExpandedState: initialExpandedState || getTreeExpandedState(nodes, '*'),
  });

  /**
   * Local state
   */
  const treeRef = useRef<HTMLDivElement>(null);
  const flattenedNodes = useMemo(() => getFlattenNodes(nodes), [nodes]);
  const flattenedNodeIds = useMemo(
    () => flattenedNodes.map((node) => node.value),
    [flattenedNodes],
  );

  const selectedDeleteableNodeIds = useMemo(
    () =>
      flattenedNodes
        .filter((node) => !!node.onDelete)
        .filter((node) => tree.selectedState.includes(node.value))
        .map((node) => node.value),
    [tree.selectedState, flattenedNodes],
  );

  const isFocused = treeRef.current && treeRef.current.contains(document.activeElement);

  /**
   * Handlers
   */
  const overrideContextMenu: TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> | null =
    useMemo(() => {
      // if there are multiple selected nodes show the delete all menu instead of the default one

      // 0, 1 = no multi-select
      if (tree.selectedState.length < 2) {
        return null;
      }

      return [
        {
          children: [
            {
              label: 'Delete selected',
              // Disable if none of the selected nodes are deletable
              isDisabled: selectedDeleteableNodeIds.length === 0,
              onClick: (_) => {
                onDeleteSelected(selectedDeleteableNodeIds);
                tree.clearSelected();
              },
            },
          ],
        },
      ];
    }, [tree.selectedState, selectedDeleteableNodeIds]);

  /**
   * Callbacks
   */
  const handleRenderNode = useCallback(
    (payload: MantineRenderTreeNodePayload): ReactNode => (
      // @ts-ignore
      <TreeNodeComponent
        {...payload}
        dataTestIdPrefix={dataTestIdPrefix}
        overrideContextMenu={overrideContextMenu}
        flattenedNodeIds={flattenedNodeIds}
        extraData={extraData}
      />
    ),
    [flattenedNodeIds, dataTestIdPrefix, overrideContextMenu],
  );

  /**
   * Effects
   */
  useHotkeys([
    ['Escape', () => isFocused && tree.clearSelected()],
    [
      'mod+a',
      () => {
        if (isFocused) {
          tree.setSelectedState(flattenedNodeIds);
        }
      },
    ],
    [
      'mod+Backspace',
      () => {
        if (selectedDeleteableNodeIds.length === 0) {
          return;
        }
        onDeleteSelected(selectedDeleteableNodeIds);
        tree.clearSelected();
      },
    ],
  ]);

  useEffect(() => {
    if (!hasActiveElement) {
      tree.clearSelected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveElement]);

  return (
    <Stack
      gap={0}
      className={cn('h-[calc(100%-50px)]')}
      data-testid={setDataTestId(dataTestIdPrefix)}
      ref={treeRef}
    >
      <Stack gap={0} className="overflow-y-scroll custom-scroll-hidden px-2 pb-1 h-full">
        <>
          {nodes.length === 0 ? (
            <Group justify="center" className="px-3 pt-2">
              <Text c="text-secondary">No data to display</Text>
            </Group>
          ) : (
            <Tree
              data={nodes}
              tree={tree}
              selectOnClick
              clearSelectionOnOutsideClick
              renderNode={handleRenderNode}
            />
          )}
        </>
      </Stack>
    </Stack>
  );
};
