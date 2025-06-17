import { ExplorerTree, TreeNodeData } from '@components/explorer-tree';
import { Text, Stack } from '@mantine/core';

import { DataExplorerNode } from '../data-explorer-node';
import { DataExplorerContext, DataExplorerNodeTypeMap } from '../model';

type DataExplorerSectionProps = {
  title?: string;
  nodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  initialExpandedState: Record<string, boolean>;
  extraData: DataExplorerContext;
  dataTestIdPrefix: string;
  hasActiveElement: boolean;
};

export const DataExplorerSection = ({
  title,
  nodes,
  initialExpandedState,
  extraData,
  dataTestIdPrefix,
  hasActiveElement,
}: DataExplorerSectionProps) => {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <Stack gap={title ? 0 : 'xs'}>
      {title && (
        <Text size="sm" fw={600} c="dimmed" px="xs" py={4}>
          {title}
        </Text>
      )}
      <ExplorerTree<DataExplorerNodeTypeMap, DataExplorerContext>
        nodes={nodes}
        initialExpandedState={initialExpandedState}
        extraData={extraData}
        dataTestIdPrefix={dataTestIdPrefix}
        TreeNodeComponent={DataExplorerNode}
        hasActiveElement={hasActiveElement}
      />
    </Stack>
  );
};
