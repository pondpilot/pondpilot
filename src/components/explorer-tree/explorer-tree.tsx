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

import { RenderTreeNodePayload, TreeNodeData } from './model';
import { getFlattenNodes } from './utils/tree-manipulation';

type ExplorerTreeProps<NTypeToIdTypeMap extends Record<string, any>, ExtraT = undefined> = {
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
   * If set to false, the selection state will be cleared.
   */
  hasActiveElement: boolean;

  /**
   * Used to pass arbitrary extra data that is passed through to TreeNodeComponent
   * for rendering.
   */
  readonly extraData: ExtraT;
};

export const ExplorerTree = <NTypeToIdTypeMap extends Record<string, any>, ExtraT = undefined>({
  nodes,
  initialExpandedState,
  dataTestIdPrefix,
  TreeNodeComponent,
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

  const isFocused = treeRef.current && treeRef.current.contains(document.activeElement);

  /**
   * Handlers
   */

  /**
   * Callbacks
   */
  const handleRenderNode = useCallback(
    (payload: MantineRenderTreeNodePayload): ReactNode => {
      // Build the enhanced payload with the required properties
      // Note: Complex conditional types in RenderTreeNodePayload make proper typing challenging
      const enhancedPayload = {
        ...payload,
        node: payload.node as TreeNodeData<NTypeToIdTypeMap>,
        dataTestIdPrefix,
        overrideContextMenu: null, // This will be set by the TreeNodeComponent if needed
        flattenedNodeIds,
        ...(extraData !== undefined ? { extraData } : {}),
      };

      return <TreeNodeComponent {...(enhancedPayload as any)} />;
    },
    [flattenedNodeIds, dataTestIdPrefix, extraData, TreeNodeComponent],
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
  ]);

  useEffect(() => {
    if (!hasActiveElement) {
      tree.clearSelected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveElement]);

  // Track nodes that were expanded by search
  const searchExpandedNodesRef = useRef<Set<string>>(new Set());

  // Update expanded state when it changes (e.g., for search)
  useEffect(() => {
    if (initialExpandedState) {
      // The expandedState is an object where keys are node IDs and values are booleans
      const currentExpandedObj = tree.expandedState as Record<string, boolean>;
      const hasSearchExpansions = Object.values(initialExpandedState).some((v) => v);

      if (hasSearchExpansions) {
        // We're in search mode - expand nodes that should be expanded
        const nodesToExpand: string[] = [];
        Object.entries(initialExpandedState).forEach(([nodeId, shouldExpand]) => {
          const isCurrentlyExpanded = currentExpandedObj[nodeId] === true;

          if (shouldExpand && !isCurrentlyExpanded) {
            nodesToExpand.push(nodeId);
            searchExpandedNodesRef.current.add(nodeId);
          }
        });
        // Batch expand operations
        if (nodesToExpand.length > 0) {
          nodesToExpand.forEach((nodeId) => tree.expand(nodeId));
        }
      } else if (searchExpandedNodesRef.current.size > 0) {
        // Search cleared - collapse nodes that were expanded by search
        const nodesToCollapse: string[] = [];
        searchExpandedNodesRef.current.forEach((nodeId) => {
          if (currentExpandedObj[nodeId] === true) {
            nodesToCollapse.push(nodeId);
          }
        });
        // Batch collapse operations
        if (nodesToCollapse.length > 0) {
          nodesToCollapse.forEach((nodeId) => tree.collapse(nodeId));
        }
        searchExpandedNodesRef.current.clear();
      }
    }
  }, [initialExpandedState, tree]);

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
