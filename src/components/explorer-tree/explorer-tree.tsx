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
import { ReactNode, useCallback, useMemo, useRef, useEffect } from 'react';

import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

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
    (payload: MantineRenderTreeNodePayload): ReactNode => (
      // @ts-ignore
      <TreeNodeComponent
        {...payload}
        dataTestIdPrefix={dataTestIdPrefix}
        flattenedNodeIds={flattenedNodeIds}
        extraData={extraData}
      />
    ),
    [flattenedNodeIds, dataTestIdPrefix, extraData],
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
