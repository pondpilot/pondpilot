import {
  Stack,
  Group,
  Text,
  Skeleton,
  Tree,
  useTree,
  getTreeExpandedState,
  RenderTreeNodePayload as MantineRenderTreeNodePayload,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { ReactNode, useCallback, useMemo, useRef } from 'react';
import { RenderTreeNodePayload, TreeMenu, TreeNodeData } from './model';
import { getFlattenNodes } from './utils/tree-manipulation';

interface ExplorerTreeProps<NTypeToIdTypeMap extends Record<string, string>> {
  /**
   * A sorted tree of nodes to be displayed
   */
  nodes: TreeNodeData<NTypeToIdTypeMap>[];
  loading?: boolean;
  /**
   * Used as the data-testid for the tree. The resulting data-testid:
   * `${dataTestIdPrefix}-tree`.
   */
  dataTestIdPrefix: string;

  TreeNodeComponent: React.ComponentType<RenderTreeNodePayload<NTypeToIdTypeMap>>;
  onDeleteSelected: (ids: NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]) => void;
}

export const ExplorerTree = <NTypeToIdTypeMap extends Record<string, string>>({
  nodes,
  loading,
  dataTestIdPrefix,
  TreeNodeComponent,
  onDeleteSelected,
}: ExplorerTreeProps<NTypeToIdTypeMap>) => {
  /**
   * Common hooks
   */
  const tree = useTree({
    initialExpandedState: getTreeExpandedState(nodes, '*'),
  });

  /**
   * Local state
   */
  const treeRef = useRef<HTMLDivElement>(null);
  const flattenedNodes = getFlattenNodes(nodes);
  const flattenedNodeIds = flattenedNodes.map((node) => node.value);
  const flattenedDeletableNodeIds = new Set(
    flattenedNodes.filter((node) => !!node.onDelete).map((node) => node.value),
  );

  const isFocused = treeRef.current && treeRef.current.contains(document.activeElement);

  /**
   * Handlers
   */
  const overrideContextMenu: TreeMenu<TreeNodeData<NTypeToIdTypeMap>> | null = useMemo(() => {
    // if there are multiple selected nodes and all of them are delteable,
    // show the delete all menu instead of the default one

    // 0, 1 or some non-deletable selected nodes
    if (
      tree.selectedState.length < 2 ||
      tree.selectedState.some(
        (id) => !flattenedDeletableNodeIds.has(id as NTypeToIdTypeMap[keyof NTypeToIdTypeMap]),
      )
    ) {
      return null;
    }

    return [
      {
        children: [
          {
            label: 'Delete selected',
            onClick: (_) => {
              onDeleteSelected(tree.selectedState as NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]);
              tree.clearSelected();
            },
          },
        ],
      },
    ];
  }, [tree.selectedState, flattenedDeletableNodeIds]);

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
        if (
          !tree.selectedState.length ||
          tree.selectedState.some(
            (id) => !flattenedDeletableNodeIds.has(id as NTypeToIdTypeMap[keyof NTypeToIdTypeMap]),
          )
        ) {
          return;
        }
        onDeleteSelected(tree.selectedState as NTypeToIdTypeMap[keyof NTypeToIdTypeMap][]);
        tree.clearSelected();
      },
    ],
  ]);

  return (
    <Stack
      gap={0}
      className={cn('h-[calc(100%-50px)]')}
      data-testid={setDataTestId(dataTestIdPrefix)}
      ref={treeRef}
    >
      <Stack gap={0} className="overflow-y-scroll custom-scroll-hidden px-2 pb-1 h-full">
        {loading ? (
          <Stack gap={6} className="px-3 py-1.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={13} width={Math.random() * 100 + 70} />
            ))}
          </Stack>
        ) : (
          <>
            {nodes.length === 0 ? (
              <Group justify="center" className="px-3 pt-2">
                <Text c="text-secondary">No data to display</Text>
              </Group>
            ) : (
              <Tree data={nodes} tree={tree} selectOnClick renderNode={handleRenderNode} />
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
};
